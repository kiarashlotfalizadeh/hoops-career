import { AccoladeChips, accolades, useQueryParam } from '../league/shared';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, MessageCircle, PenLine, Scale } from 'lucide-react';
import { useLeague, useStore } from '../../state/store';
import type { League, Player, PlayerStats, RatingKey, TrainingFocus } from '../../core/types';
import { DRAFT_PROSPECT, FREE_AGENT, RETIRED } from '../../core/types';
import { RATING_META, ROLE_META, archetype, attrDisplay, composites, fmtHeight, ovrWeights, tierLabel } from '../../core/ratings';
import { Avatar, Bar, Card, Chips, Empty, Help, Kpi, Ovr, PageHeader, Segmented, Sheet, StatTable, Tag, pct, type Col } from '../components/ui';
import { TeamLogo } from '../components/TeamLogo';
import { RoleEditor } from '../components/RoleEditor';
import { LineChart } from '../components/charts';
import { f1, ordinalSuffix, p1, perGame, playerSeason, seasonLine, signed } from '../stats';
import { ReleaseConfirm, capSeason, contractUpNote, fmtM, openOption, shortSeason, tradeClosedNote } from '../office/common';
import { ContractSheet } from '../office/ContractSheet';
import { contractExp, extensionStart, playerAge, salaryFor } from '../../core/playerGen';
import { moodLevel, MOOD_META, meetBlockedReason, promiseStatus, wantsMeeting } from '../../core/league/morale';
import { MeetingPanel } from '../office/PlayerMeeting';
import { FOCUS_META, ratingMeans } from '../../core/league/progression';
import { askingContract, convertTwoWay, extensionBlockedReason, marketSalary, releaseBlockedReason, rookieScaleDeal } from '../../core/league/contracts';
import { untradeableReason } from '../../core/league/trades';
import { liveInProgress } from '../../state/live';
import { seasonLabel } from '../../core/constants';
import { BBREF_TO_TID } from '../../core/teams';
import { PlayerMoves } from '../league/MovesTab';
import { deadlineLabel } from '../../core/league/rfa';
import { sheetTerms } from '../office/RfaPanel';
import { TenDayActions, tenDayLine } from '../office/TenDayPanel';
import { REC_LABEL, REC_STATS, careerHighOf } from '../../core/league/records';
import { careerOnRecord } from '../../core/analysis/milestones';
import { fmtDate } from '../../core/league/helpers';
import { SKILLS, skillColor, useSkillPercentiles } from '../playerSkills';
import { PlayerPicker } from '../components/PlayerPicker';
import { compareHref } from '../compare';

type Tab = 'overview' | 'ratings' | 'stats' | 'log' | 'dev';

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
    rows.push({
      key: k,
      season: list[0].season,
      playoffs: list[0].playoffs,
      teams: list.map((s) => (typeof s.tid === 'number' ? s.tid : (BBREF_TO_TID[String(s.tid)] ?? -1))),
      // a season split between teams: its totals, and its imported advanced numbers combined
      tot: seasonLine(p, list[0].season, list[0].playoffs)!,
    });
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
  const [roleOpen, setRoleOpen] = useState(false);
  const [extending, setExtending] = useState(false);
  const [openRating, setOpenRating] = useState<string | null>(null);
  // the trade-request mail links here with ?meet=1
  const [params] = useSearchParams();
  const [meeting, setMeeting] = useState(() => params.get('meet') === '1');
  const [comparing, setComparing] = useState(false);
  const pctile = useSkillPercentiles(league);
  if (!p) {
    return (
      <main className="page">
        <PageHeader title="Player" back backTo="/roster" />
        <Empty>Player not found.</Empty>
      </main>
    );
  }
  const age = playerAge(p, league.season);
  const team = p.tid >= 0 ? league.teams[p.tid] : null;
  // a fired coach's old team isn't his to run
  const mine = p.tid === league.userTid && !league.fired;
  // a paused live game would record a moved player's line for his old team; a contract that's up is re-signed or let go, as in the Office
  const busyWhy = liveInProgress(league) ? 'Finish your live game first.' : null;
  const upNote = contractUpNote(league, p);
  const tradeWhy = busyWhy ?? upNote ?? tradeClosedNote(league) ?? untradeableReason(league, p);
  const releaseWhy = busyWhy ?? upNote ?? releaseBlockedReason(league, p);
  const extStart = extensionStart(p.contract);
  // in the final season of a standard deal: extend him, or why not yet
  const finalSeason = mine && !p.contract.twoWay && extStart === null && contractExp(p.contract) === capSeason(league);
  const extendWhy = finalSeason ? (busyWhy ?? extensionBlockedReason(league, p)) : null;
  const c = composites(p.ratings);
  const arch = archetype(p.ratings);
  const role = team ? (team.tactics.offense.roles[p.pid] ?? arch.role) : arch.role;
  const mood = MOOD_META[moodLevel(p.mood.score)];
  const cur = playerSeason(p, league.season);
  // before his first game this season, show his most recent season instead
  const lastSeason = cur ? null : Math.max(0, ...p.stats.filter((s) => !s.playoffs && s.gp > 0).map((s) => s.season));
  const line = cur ?? (lastSeason ? playerSeason(p, lastSeason) : null);
  // the season contracts count against (next season in the offseason), or this one for a contract that's up
  const salSeason = salaryFor(p, capSeason(league)) ? capSeason(league) : league.season;
  const sal = salaryFor(p, salSeason);
  const faAsk = p.tid === FREE_AGENT ? askingContract(league, p, league.userTid) : null;
  const status =
    p.tid === FREE_AGENT
      ? p.rfa
        ? 'Restricted free agent'
        : 'Free agent'
      : p.tid === DRAFT_PROSPECT
        ? `${p.draft.year} draft prospect`
        : p.tid === RETIRED
          ? `Retired${p.retiredSeason ? ` after ${seasonLabel(p.retiredSeason)}` : ''}`
          : team
            ? `${team.region} ${team.name}`
            : '';
  const contribs = ovrContributions(league, p);
  const pluses = contribs.parts.filter((x) => x.delta > 0).slice(0, 4);
  const minuses = contribs.parts
    .filter((x) => x.delta < 0)
    .slice(-3)
    .reverse();

  return (
    <main className="page">
      <PageHeader
        title={p.lastName}
        sub={status}
        back
        backTo={mine ? '/roster' : team ? `/team/${team.tid}` : '/'}
        right={
          <button className="btn sm ghost" aria-haspopup="dialog" onClick={() => setComparing(true)}>
            <Scale size={16} /> Compare
          </button>
        }
      />
      <Card accent>
        <div className="row top" style={{ gap: 14 }}>
          <Avatar p={p} size="lg" />
          <div className="grow">
            <div className="bold" style={{ fontSize: 19 }}>
              {p.firstName} {p.lastName}
            </div>
            <div className="small dim2">
              {p.pos}
              {p.jersey ? ` · #${p.jersey}` : ''} · {age} yrs · {fmtHeight(p.heightIn)} · {p.weightLb} lb
            </div>
            <div className="small dim">
              {p.country}
              {p.college ? ` · ${p.college}` : ''}
              {p.draft.round > 0 ? ` · ${p.draft.year} R${p.draft.round} #${p.draft.pick}` : p.draft.year && p.tid !== DRAFT_PROSPECT ? ` · Undrafted` : ''}
            </div>
            <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
              <Tag tone="info">{p.archetype}</Tag>
              <Tag>{tierLabel(p.ovr)}</Tag>
              {p.contract.twoWay && p.tid >= 0 && <Tag>Two-way</Tag>}
              {p.injury && (
                <Tag tone="bad">
                  {p.injury.type} · {p.injury.gamesRemaining}g
                </Tag>
              )}
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
          <Kpi k="PTS" v={line ? f1(line.pts) : '—'} />
          <Kpi k="REB" v={line ? f1(line.reb) : '—'} />
          <Kpi k="AST" v={line ? f1(line.ast) : '—'} />
          {/* no shots, no percentage: "—", not 0.0 */}
          <Kpi k="TS%" v={line && (line.fga || line.fta) ? pct(line.tsPct) : '—'} />
        </div>
        {!cur && line && lastSeason ? (
          <div className="tiny dim" style={{ marginTop: 6 }}>
            {seasonLabel(lastSeason)} per game{p.stats.some((s) => s.season === lastSeason && s.real) ? ' (real)' : ''}
          </div>
        ) : null}
      </Card>

      <Segmented
        value={tab}
        onChange={setTab}
        label="Player sections"
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
          <Card
            title="Scouting profile"
            right={
              <Help title="How skills are measured">
                Each skill is a blend of underlying ratings, the same blend the game engine uses. Percentiles compare him with every rostered NBA player.
              </Help>
            }
          >
            <div className="col" style={{ gap: 9 }}>
              {SKILLS.map((s) => {
                const val = s.get(c, p);
                const pc = pctile(s.key, val);
                return (
                  <div key={s.key} className="ratingrow" style={{ gridTemplateColumns: '128px 1fr 44px' }}>
                    <span className="dim2">{s.label}</span>
                    <Bar value={pc} color={skillColor(pc)} />
                    <span className="num right small">
                      {pc}
                      <span className="dim tiny">{ordinalSuffix(pc)}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
          <div className="md-grid2">
            <Card title="Why he's a" right={<Ovr v={p.ovr} size="sm" />}>
              <div className="small dim" style={{ marginBottom: 8 }}>
                {contribs.gap === 0 ? 'Right at' : `${Math.abs(contribs.gap)} point${Math.abs(contribs.gap) === 1 ? '' : 's'} ${contribs.gap > 0 ? 'above' : 'below'}`} an average
                NBA player ({AVERAGE_OVR}). Biggest reasons, in OVR points:
              </div>
              <div className="col" style={{ gap: 6 }}>
                {pluses.map((x) => (
                  <div key={x.key} className="row between small">
                    <span>{x.label}</span>
                    <span className="good num">+{x.delta}</span>
                  </div>
                ))}
                {pluses.length > 0 && minuses.length > 0 && <div className="divider" />}
                {minuses.map((x) => (
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
                {arch.role !== role && <div className="small warn">His natural role is {ROLE_META[arch.role].label}.</div>}
                {team && (
                  <div className="small dim2">
                    Shot freedom: {['Limited', 'Normal', 'Green light'][(team.tactics.offense.freedom[p.pid] ?? 0) + 1]} · Planned minutes:{' '}
                    {p.injury ? 'out (injured)' : (team.rotation.minutes[p.pid] ?? 0)}
                  </div>
                )}
                {cur && (
                  <div className="small dim2">
                    Usage {p1(cur.usg)} · On-court net {signed(cur.onOff)} · +/- {signed(cur.pm)}
                  </div>
                )}
                {mine && (
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn xs" onClick={() => setRoleOpen(true)}>
                      Set role
                    </button>
                    <Link to="/rotation" className="btn xs">
                      Minutes
                    </Link>
                  </div>
                )}
              </div>
            </Card>
          </div>
          <div className="md-grid2">
            {/* retired players and prospects have no mood to show */}
            {p.tid !== RETIRED && p.tid !== DRAFT_PROSPECT && (
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
                {/* one who asked out or is unhappy can be met, and promised something */}
                {mine && p.promise && (
                  <div className="small bold" style={{ marginTop: 8 }}>
                    {promiseStatus(league, p)}
                  </div>
                )}
                {mine && !p.promise && wantsMeeting(p) && (
                  <>
                    <button className="btn xs" style={{ marginTop: 10 }} disabled={!!(busyWhy ?? meetBlockedReason(league, p))} onClick={() => setMeeting(true)}>
                      <MessageCircle size={14} /> Meet with him
                    </button>
                    {(busyWhy ?? meetBlockedReason(league, p)) && (
                      <div className="tiny dim" style={{ marginTop: 6 }}>
                        {busyWhy ?? meetBlockedReason(league, p)}
                      </div>
                    )}
                  </>
                )}
              </Card>
            )}
            <Card title="Contract">
              {p.tid >= 0 ? (
                <div className="col" style={{ gap: 6 }}>
                  <div className="row between">
                    <span className="dim2 small">{seasonLabel(salSeason)} salary</span>
                    <span className="bold num">{fmtM(sal)}</span>
                  </div>
                  <div className="row between">
                    <span className="dim2 small">{extStart !== null ? 'Current deal ends' : 'Expires'}</span>
                    <span className="num">
                      {seasonLabel(extStart !== null ? extStart - 1 : contractExp(p.contract))}
                      {openOption(league, p) ? ` (${openOption(league, p)} option)` : ''}
                      {rookieScaleDeal(p) ? ' · rookie scale' : ''}
                    </span>
                  </div>
                  {extStart !== null && (
                    <>
                      <div className="row between">
                        <span className="small good bold">Extended through</span>
                        <span className="num">{seasonLabel(contractExp(p.contract))}</span>
                      </div>
                      <div className="row between">
                        <span className="dim2 small">Extension starts</span>
                        <span className="num">
                          {fmtM(salaryFor(p, extStart))} in {shortSeason(extStart)}
                        </span>
                      </div>
                    </>
                  )}
                  {p.contract.twoWay && <div className="small dim2">Two-way deal: outside the 15-man roster and the cap. He only plays when the team is short-handed.</div>}
                  {p.contract.tenDay && <div className="small dim2">{tenDayLine(league, p)}</div>}
                  {p.rfa && (
                    <div className="small dim2">
                      Qualifying offer extended ({fmtM(p.rfa.qo)} for {seasonLabel(league.season + 1)}): he becomes a restricted free agent when free agency opens.
                    </div>
                  )}
                  <div className="row between">
                    <span className="dim2 small">Market value</span>
                    <span className="num">{fmtM(marketSalary(league, p))}</span>
                  </div>
                </div>
              ) : faAsk ? (
                <div className="col" style={{ gap: 8 }}>
                  <div className="small dim2">
                    {p.waivers
                      ? `On waivers: any team can claim his contract until he clears ${p.waivers.until - league.day > 1 ? `in ${p.waivers.until - league.day} days` : 'tomorrow'}.`
                      : p.rfa?.sheet
                        ? `Restricted: he signed an offer sheet with ${league.teams[p.rfa.sheet.tid].abbrev} (${sheetTerms(league, p)}). ${league.teams[p.rfa.tid].abbrev} can match it until the end of ${deadlineLabel(p.rfa.sheet.until)}.`
                        : p.rfa?.tid === league.userTid
                          ? `Your restricted free agent: re-sign him with Bird rights (asking ${fmtM(faAsk.amount)} × ${faAsk.years} yr${faAsk.years === 1 ? '' : 's'}), or match any offer sheet. Unsigned at the close, he takes his ${fmtM(p.rfa.qo)} qualifying offer.`
                          : p.rfa
                            ? `Restricted: ${league.teams[p.rfa.tid].abbrev} can match any offer sheet. Asking ${fmtM(faAsk.amount)} × ${faAsk.years} yr${faAsk.years === 1 ? '' : 's'} from you.`
                            : `Asking ${fmtM(faAsk.amount)} × ${faAsk.years} yr${faAsk.years === 1 ? '' : 's'} from you.`}
                  </div>
                  {/* straight to his offer (or claim) sheet on the Free Agents screen */}
                  {!p.rfa?.sheet && (
                    <Link className="btn sm primary" to={`/free-agents?offer=${p.pid}`}>
                      {p.waivers ? 'Claim off waivers' : p.rfa?.tid === league.userTid ? 'Re-sign' : p.rfa ? 'Offer sheet' : 'Make an offer'}
                    </Link>
                  )}
                </div>
              ) : p.tid === DRAFT_PROSPECT ? (
                <div className="small dim2">Eligible for the {p.draft.year} draft.</div>
              ) : (
                <div className="small dim">—</div>
              )}
              {mine ? (
                <>
                  <div className="row" style={{ marginTop: 10, gap: 6 }}>
                    {tradeWhy ? (
                      <button className="btn xs" disabled>
                        <ArrowLeftRight size={14} /> Trade
                      </button>
                    ) : (
                      <Link className="btn xs" to={`/trade?give=${p.pid}`}>
                        <ArrowLeftRight size={14} /> Trade
                      </Link>
                    )}
                    {finalSeason && (
                      <button className="btn xs" disabled={!!extendWhy} onClick={() => setExtending(true)}>
                        <PenLine size={14} /> Extend
                      </button>
                    )}
                    {p.contract.twoWay && (
                      <button
                        className="btn xs"
                        disabled={!!busyWhy}
                        onClick={() => {
                          let res = { ok: false, reason: '' };
                          useStore.getState().mutate((l) => void (res = convertTwoWay(l, p.pid)));
                          useStore.getState().toast(res.reason, res.ok ? 'good' : 'bad');
                        }}
                      >
                        Convert to standard
                      </button>
                    )}
                    <button className="btn xs danger" disabled={!!releaseWhy} onClick={() => setConfirmRelease(true)}>
                      Release
                    </button>
                  </div>
                  {(tradeWhy || releaseWhy || extendWhy) && (
                    <div className="tiny dim" style={{ marginTop: 6 }}>
                      {[...new Set([tradeWhy, releaseWhy, extendWhy])].filter(Boolean).join(' ')}
                    </div>
                  )}
                  {p.contract.tenDay && (
                    <div style={{ marginTop: 10 }}>
                      <TenDayActions league={league} p={p} />
                    </div>
                  )}
                </>
              ) : (
                p.tid >= 0 &&
                p.tid !== league.userTid && (
                  <div className="row" style={{ marginTop: 10, gap: 6 }}>
                    <Link className="btn xs" to={`/trade?with=${p.tid}&get=${p.pid}`}>
                      <ArrowLeftRight size={14} /> Trade for him
                    </Link>
                  </div>
                )
              )}
            </Card>
          </div>
          {/* the same honors, names and order as the league history (the Hall of Fame has its own tag above) */}
          {accolades(p).length > 0 && (
            <Card title="Honors">
              <AccoladeChips p={p} max={Infinity} />
            </Card>
          )}
          <PlayerMoves league={league} pid={p.pid} />
        </>
      )}

      {tab === 'ratings' && (
        <>
          <div className="tiny dim" style={{ margin: '0 2px 8px' }}>
            Tap a rating to see what it does in the engine.
          </div>
          {(['Physical', 'Scoring', 'Playmaking', 'Defense', 'Rebounding'] as const).map((g) => (
            <Card key={g} title={g}>
              <div className="col" style={{ gap: 6 }}>
                {RATING_META.filter((m) => m.group === g).map((m) => {
                  const val = attrDisplay(p.ratings[m.key as RatingKey]);
                  const was = p.ratingsHistory.length > 1 ? p.ratingsHistory[p.ratingsHistory.length - 2].r?.[m.key as RatingKey] : undefined;
                  const prev = was === undefined ? null : attrDisplay(was);
                  const open = openRating === m.key;
                  return (
                    <div key={m.key}>
                      <button
                        className="ratingrow block"
                        style={{ gridTemplateColumns: '108px 1fr 54px', width: '100%', textAlign: 'left' }}
                        onClick={() => setOpenRating(open ? null : m.key)}
                        aria-expanded={open}
                      >
                        <span className="dim2">{m.label}</span>
                        <Bar value={((val - 40) / 59) * 100} color={val >= 85 ? 'var(--tier-elite)' : val >= 75 ? 'var(--good)' : val >= 64 ? 'var(--info)' : 'var(--text-dim)'} />
                        <span className="num right bold">
                          {val}
                          {prev !== null && val !== prev && (
                            <span className={`tiny ${val > prev ? 'good' : 'bad'}`}>
                              {' '}
                              {val > prev ? '+' : ''}
                              {val - prev}
                            </span>
                          )}
                        </span>
                      </button>
                      {open && (
                        <div className="tiny dim fade-in" style={{ padding: '2px 0 6px' }}>
                          {m.help}
                        </div>
                      )}
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

      <Sheet open={roleOpen} onClose={() => setRoleOpen(false)} title={`${p.firstName} ${p.lastName}: role`}>
        <RoleEditor p={p} onDone={() => setRoleOpen(false)} />
      </Sheet>
      <Sheet open={confirmRelease && mine && !releaseWhy} onClose={() => setConfirmRelease(false)} title={`Release ${p.lastName}?`}>
        <div className="col" style={{ gap: 12 }}>
          <ReleaseConfirm league={league} p={p} onKeep={() => setConfirmRelease(false)} onDone={() => (setConfirmRelease(false), nav('/roster'))} />
        </div>
      </Sheet>
      <ContractSheet pid={extending && mine ? p.pid : null} mode="extend" onClose={() => setExtending(false)} />
      <Sheet open={meeting && mine && (wantsMeeting(p) || !!p.promise)} onClose={() => setMeeting(false)} title={`Meet with ${p.lastName}`}>
        <MeetingPanel league={league} p={p} />
      </Sheet>
      <PlayerPicker open={comparing} onClose={() => setComparing(false)} anchor={p} title={`Compare ${p.lastName} with…`} onPick={(other) => nav(compareHref(p.pid, other))} />
    </main>
  );
}

function StatsTab({ p, league }: { p: Player; league: League }) {
  const [po, setPo] = useState(false);
  const rows = seasonsOf(p).filter((r) => r.playoffs === po);
  type R = (typeof rows)[number];
  const pg = (r: R) => perGame(r.tot)!;
  const cols: Col<R>[] = [
    {
      key: 'season',
      label: 'Season',
      left: true,
      sticky: true,
      get: (r) => r.season,
      fmt: (_, r) => (
        <span className="bold">
          {seasonLabel(r.season)}
          {r.tot.real ? <span className="tiny dim"> real</span> : ''}
        </span>
      ),
    },
    { key: 'tm', label: 'Team', left: true, get: (r) => r.teams.map((t) => league.teams[t]?.abbrev ?? '?').join('/') },
    { key: 'gp', label: 'GP', get: (r) => r.tot.gp },
    { key: 'min', label: 'MIN', get: (r) => pg(r).min, fmt: (v) => f1(v as number) },
    { key: 'pts', label: 'PTS', get: (r) => pg(r).pts, fmt: (v) => f1(v as number) },
    { key: 'reb', label: 'REB', get: (r) => pg(r).reb, fmt: (v) => f1(v as number) },
    { key: 'ast', label: 'AST', get: (r) => pg(r).ast, fmt: (v) => f1(v as number) },
    { key: 'stl', label: 'STL', get: (r) => pg(r).stl, fmt: (v) => f1(v as number) },
    { key: 'blk', label: 'BLK', get: (r) => pg(r).blk, fmt: (v) => f1(v as number) },
    { key: 'tov', label: 'TOV', get: (r) => pg(r).tov, fmt: (v) => f1(v as number) },
    // the % lives in the header, as in the league stats
    // a season without an attempt reads "—" (and sorts last), not 0.0
    { key: 'fg', label: 'FG%', get: (r) => (r.tot.fga ? pg(r).fgPct : NaN), fmt: (v) => pct(v as number) },
    { key: 'tp', label: '3P%', get: (r) => (r.tot.tpa ? pg(r).tpPct : NaN), fmt: (v) => pct(v as number) },
    { key: 'tpa', label: '3PA', get: (r) => pg(r).tpa, fmt: (v) => f1(v as number) },
    { key: 'ft', label: 'FT%', get: (r) => (r.tot.fta ? pg(r).ftPct : NaN), fmt: (v) => pct(v as number) },
    { key: 'ts', label: 'TS%', get: (r) => (r.tot.fga || r.tot.fta ? pg(r).tsPct : NaN), fmt: (v) => pct(v as number) },
    { key: 'usg', label: 'USG%', get: (r) => pg(r).usg, fmt: (v) => pct(v as number) },
    { key: 'per', label: 'PER', get: (r) => r.tot.adv?.per ?? NaN, fmt: (v) => (isNaN(v as number) ? '—' : f1(v as number)) },
    { key: 'bpm', label: 'BPM', get: (r) => r.tot.adv?.bpm ?? NaN, fmt: (v) => (isNaN(v as number) ? '—' : signed(v as number)) },
    { key: 'ws', label: 'WS', get: (r) => r.tot.adv?.ws ?? NaN, fmt: (v) => (isNaN(v as number) ? '—' : f1(v as number)) },
    // imported seasons carry no plus-minus: "—", not 0.0 (as in the league stats)
    { key: 'pm', label: '+/-', get: (r) => (r.tot.real && !r.tot.pm ? NaN : pg(r).pm), fmt: (v) => signed(v as number) },
  ];
  return (
    <>
      <Segmented
        value={po ? 'po' : 'rs'}
        onChange={(v) => setPo(v === 'po')}
        label="Season type"
        options={[
          { id: 'rs', label: 'Regular season' },
          { id: 'po', label: 'Playoffs' },
        ]}
      />
      {rows.length ? <StatTable rows={rows} cols={cols} rowKey={(r) => r.key} /> : <Empty>{po ? 'No playoff games yet.' : 'No NBA games yet.'}</Empty>}
      <div className="tiny dim">“real” seasons are imported from Basketball Reference; PER, BPM and WS exist only for those, +/- only for simulated seasons.</div>
      {!po && <CareerHighs p={p} league={league} />}
    </>
  );
}

/** His regular-season career highs: the whole career's when it's all in this league's book, otherwise since the book began. */
function CareerHighs({ p, league }: { p: Player; league: League }) {
  const highs = p.highs;
  if (!highs || !Object.keys(highs).length) return null;
  const since = league.records?.since ?? league.startSeason;
  const first = Math.min(...p.stats.filter((s) => !s.real).map((s) => s.season));
  const whole = !p.stats.some((s) => s.real) && careerOnRecord(p, league.season) && first >= since;
  const stored = new Set(league.games.map((g) => g.gid));
  return (
    <Card title={whole ? 'Career highs' : `Highs since ${seasonLabel(since)}`}>
      <div className="lg-team5">
        {REC_STATS.filter((k) => highs[k]).map((k) => {
          const h = careerHighOf(p, k)!;
          const text = `vs ${league.teams[h.opp]?.abbrev ?? '?'} · ${fmtDate(h.season, h.day, { month: 'short', day: 'numeric', year: 'numeric' })}`;
          return (
            <div key={k} className="lg-rec-row lbl">
              <span className="small dim2">{REC_LABEL[k][0]}</span>
              {stored.has(h.gid) ? (
                <Link to={`/game/${h.gid}`} className="tiny dim ellipsis">
                  {text}
                </Link>
              ) : (
                <span className="tiny dim ellipsis">{text}</span>
              )}
              <span className="num bold">{h.v}</span>
            </div>
          );
        })}
      </div>
    </Card>
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
    {
      key: 'opp',
      label: 'Opp',
      left: true,
      sticky: true,
      get: (r) => r.g.gid,
      fmt: (_, r) => (
        <span className="row" style={{ gap: 4 }}>
          <span className={r.won ? 'good' : 'bad'}>{r.won ? 'W' : 'L'}</span> {r.home ? 'vs' : '@'} {league.teams[r.opp.tid].abbrev}
        </span>
      ),
    },
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
  const age = playerAge(p, league.season);
  return (
    <>
      <Card title="Overall by season">
        {hist.length > 1 ? (
          <LineChart points={hist.map((h) => h.ovr)} labels={hist.map((h) => `'${String(h.season).slice(2)}`)} />
        ) : (
          <div className="small dim">
            History builds as seasons pass. Current: {p.ovr} OVR, potential {p.pot}.
          </div>
        )}
      </Card>
      <Card
        title="Outlook"
        right={
          <Help title="How development works">
            Players follow age curves: skills and IQ improve into the late 20s, while speed and explosiveness peak around 24-27 and then decline. On top of that come a hidden
            personal growth tendency, coaching quality (coach + coaching budget), practice intensity, playing time for young players (25+ minutes helps), and each player's training
            focus.
          </Help>
        }
      >
        <div className="small dim2">
          {p.tid === RETIRED
            ? `Retired${p.retiredSeason ? ` after the ${seasonLabel(p.retiredSeason)} season` : ''}.`
            : age <= 22
              ? 'Young and raw. Expect big jumps with minutes and good coaching.'
              : age <= 26
                ? 'Still improving, especially skills and decision-making.'
                : age <= 30
                  ? 'In his prime. Skill gains offset early athletic decline.'
                  : age <= 33
                    ? 'Veteran. Athleticism is fading; IQ and shooting hold up.'
                    : 'Late career. Expect steady decline; conditioning work slows it.'}
        </div>
        <div className="grid3" style={{ marginTop: 10 }}>
          <Kpi k="Age" v={age} />
          <Kpi k="Potential" v={p.pot} />
          {p.tid >= 0 && <Kpi k="Season wear" v={`${Math.round(p.wear)}/100`} sub={p.wear > 50 ? 'Needs rest' : 'Fresh'} color={p.wear > 50 ? 'var(--warn)' : undefined} />}
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
