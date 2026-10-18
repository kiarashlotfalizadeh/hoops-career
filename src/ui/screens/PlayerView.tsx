import { accolades, useQueryParam } from '../league/shared';
import { Fragment, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, ChevronLeft, ChevronRight, Clock, MessageCircle, PenLine, Pencil, Scale } from 'lucide-react';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { act, edit } from '../../state/actions';
import type { League, Player, PlayerStats, RatingKey, TrainingFocus } from '../../core/types';
import { DRAFT_PROSPECT, FREE_AGENT, RETIRED } from '../../core/types';
import { RATING_META, ROLE_META, archetype, attrDisplay, composites, fmtHeight, ovrWeights, tierLabel } from '../../core/ratings';
import { Avatar, Bar, Chips, Empty, Help, More, Ovr, PageHeader, Section, Segmented, Sheet, StatTable, Statline, Tag, pct, type Col } from '../components/ui';
import { TeamLogo } from '../components/TeamLogo';
import { RoleEditor } from '../components/RoleEditor';
import { LineChart } from '../components/charts';
import { advancedView, f1, ordinal, ordinalSuffix, perGame, playerSeason, seasonLine, signed } from '../stats';
import { ReleaseConfirm, capSeason, contractUpNote, fmtM, openOption, shortSeason, tradeClosedNote } from '../office/common';
import { ContractSheet } from '../office/ContractSheet';
import { contractExp, extensionStart, playerAge, salaryFor } from '../../core/playerGen';
import { meetBlockedReason, promiseStatus, wantsMeeting } from '../../core/league/morale';
import { effectLine, moodMeta, moodReasons, moraleEffect, roomLine } from '../../core/league/moraleView';
import { Term } from '../components/Glossary';
import { MeetingPanel } from '../office/PlayerMeeting';
import { FOCUS_META, ratingMeans } from '../../core/league/progression';
import { askingContract, convertTwoWay, extensionBlockedReason, marketSalary, releaseBlockedReason, rookieScaleDeal } from '../../core/league/contracts';
import { untradeableReason } from '../../core/league/trades';
import { liveInProgress } from '../../state/live';
import { seasonLabel } from '../../core/constants';
import { BBREF_TO_TID, FRANCHISES } from '../../core/teams';
import { PlayerMoves } from '../league/MovesTab';
import { deadlineLabel } from '../../core/league/rfa';
import { sheetTerms } from '../office/RfaPanel';
import { TenDayActions, tenDayLine } from '../office/TenDayPanel';
import { REC_LABEL, REC_STATS, careerHighOf } from '../../core/league/records';
import { careerOnRecord } from '../../core/analysis/milestones';
import { neutralSite } from '../../core/league/games';
import { fmtDate } from '../../core/league/helpers';
import { awardRaces } from '../../core/league/awards';
import { SKILLS, skillColor, useSkillPercentiles } from '../playerSkills';
import { PlayerPicker } from '../components/PlayerPicker';
import { compareHref } from '../compare';
import { LazyPlayerEditor } from '../god/lazy';
import { useBack } from '../nav';
import { slabVars } from '../teamColors';
import './team.css';

type Tab = 'overview' | 'ratings' | 'stats' | 'log' | 'dev';

/** Median OVR of rostered players (the display scale puts the 50th percentile here). */
const AVERAGE_OVR = 74;

/** A slab for a player with no team (a free agent, a prospect, a retired player): the neutral kit's colours. */
const NO_TEAM: [string, string, string] = ['#2a3441', '#8a94a4', '#c4cfdc'];

const RACES = [
  ['mvp', 'MVP'],
  ['dpoy', 'DPOY'],
  ['roy', 'ROY'],
  ['smoy', '6MOY'],
] as const;

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

/**
 * The letters in a name's longest unbreakable run ("Alexander-" in Alexander-Walker): the CSS sizes the
 * name so that run fits its column, rather than splitting it mid-word.
 */
function longestRun(name: string): number {
  return Math.max(1, ...(name.match(/[^\s-]+-?/g) ?? [name]).map((w) => w.length));
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
  const [meeting, setMeeting] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [editing, setEditing] = useState(false);
  const simming = useStore((s) => !!s.sim);
  // the agenda's trade request and the staff's mail link here with ?meet=1: the meeting opens, once
  const [params, setParams] = useSearchParams();
  const meetAsked = params.get('meet') === '1';
  useEffect(() => {
    if (!meetAsked) return;
    setMeeting(true);
    setParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.delete('meet');
        return n;
      },
      { replace: true },
    );
  }, [meetAsked, setParams]);
  const pctile = useSkillPercentiles(league);
  // this season's award ladders, as the Awards tab draws them (once games are played)
  const races = useLeagueMemo(() => {
    if (league.phase !== 'regular' || !league.teams.some((t) => t.seasons.some((s) => s.season === league.season && s.won + s.lost > 0))) return null;
    return awardRaces(league, 5);
  }, [league]);
  // back with nothing behind: your player to Team, another team's to its page, the rest to where they're kept
  const goBack = useBack(
    !p || p.tid === league.userTid
      ? '/team'
      : p.tid >= 0
        ? `/teams/${p.tid}`
        : p.tid === FREE_AGENT
          ? '/office/free-agents'
          : p.tid === DRAFT_PROSPECT
            ? '/office/draft'
            : '/league/history',
  );
  if (!p) {
    return (
      <main className="page">
        <PageHeader title="Player" back backTo="/team" />
        <div className="card">
          <Empty>That player is no longer in the league.</Empty>
        </div>
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
  const colors = team ? (team.colors ?? FRANCHISES[team.tid]?.colors ?? NO_TEAM) : NO_TEAM;
  const inRaces = races
    ? RACES.flatMap(([k, label]) => {
        const i = races[k].findIndex((x) => x.c.p.pid === p.pid);
        return i >= 0 ? [`${label} race · ${ordinal(i + 1)}`] : [];
      })
    : [];
  const freedom = team ? ['Limited', 'Normal', 'Green light'][(team.tactics.offense.freedom[p.pid] ?? 0) + 1] : null;
  const usage = [
    ...(team ? [{ k: 'Minutes', v: p.injury ? 'Out' : String(team.rotation.minutes[p.pid] ?? 0), s: p.injury ? 'injured' : 'planned' }] : []),
    ...(cur
      ? [
          { k: 'USG%', v: pct(cur.usg), s: 'usage' },
          { k: 'On net', v: signed(cur.onOff), s: 'per 100', color: cur.onOff >= 0 ? 'var(--good)' : 'var(--bad)' },
          { k: '+/-', v: signed(cur.pm), s: 'a game' },
        ]
      : []),
  ];
  const whys = [...new Set([tradeWhy, releaseWhy, extendWhy])].filter(Boolean).join(' ');
  const honors = accolades(p);
  const convert = () => {
    let res = { ok: false, reason: '' };
    if (!act('Convert his deal', (l) => void (res = convertTwoWay(l, p.pid)))) return;
    useStore.getState().toast(res.reason, res.ok ? 'good' : 'bad');
  };

  return (
    <main className="page">
      <div className="tm-bar">
        <button className="iconbtn back" onClick={goBack} aria-label="Back">
          <ChevronLeft size={24} />
        </button>
        <span className="grow" />
        {league.settings.godMode && (
          <button className="btn sm ghost" aria-haspopup="dialog" onClick={() => setEditing(true)}>
            <Pencil size={15} /> Edit
          </button>
        )}
        <button className="btn sm ghost" aria-haspopup="dialog" onClick={() => setComparing(true)}>
          <Scale size={15} /> Compare
        </button>
      </div>

      <section className="slab tm-hero" style={slabVars(colors)} aria-label={`${p.firstName} ${p.lastName}`}>
        {team && (
          <span className="slab-mark">
            <TeamLogo tid={team.tid} size={190} decorative />
          </span>
        )}
        <div className="tm-over">{[p.jersey ? `#${p.jersey}` : '', p.pos, status].filter(Boolean).join(' · ')}</div>
        <div className="tm-id">
          <Avatar p={p} size="lg" />
          <div className="tm-names">
            <span className="tm-first">{p.firstName}</span>
            <h1 className="tm-last" style={{ ['--run' as string]: longestRun(p.lastName) }}>
              {p.lastName}
            </h1>
          </div>
          <div className="tm-ovr">
            <Ovr v={p.ovr} size="lg" />
            <span className="pot">POT {p.pot}</span>
          </div>
        </div>
        <div className="tm-meta">
          {age} yrs · {fmtHeight(p.heightIn)} · {p.weightLb} lb · {p.country}
          {p.college ? ` · ${p.college}` : ''}
          {/* (the draft slot held together: "2018 R1" then "#11" alone on the next line read oddly) */}
          {p.draft.round > 0 ? ` · ${p.draft.year}\u00a0R${p.draft.round}\u00a0#${p.draft.pick}` : p.draft.year && p.tid !== DRAFT_PROSPECT ? ' · Undrafted' : ''}
        </div>
        <div className="tm-tags">
          <Tag>{p.archetype}</Tag>
          <Tag>{tierLabel(p.ovr)}</Tag>
          {p.contract.twoWay && p.tid >= 0 && <Tag>Two-way</Tag>}
          {p.injury && (
            <Tag tone="bad">
              {p.injury.type} · {p.injury.gamesRemaining}g
            </Tag>
          )}
          {p.hof && <Tag tone="warn">Hall of Fame</Tag>}
          {inRaces.map((r) => (
            <Link key={r} to="/league?tab=awards" className="tag warn">
              {r}
            </Link>
          ))}
        </div>
        <Statline
          items={[
            { k: 'PTS', v: line ? f1(line.pts) : '—' },
            { k: 'REB', v: line ? f1(line.reb) : '—' },
            { k: 'AST', v: line ? f1(line.ast) : '—' },
            // no shots, no percentage: "—", not 0.0
            { k: 'TS%', v: line && (line.fga || line.fta) ? pct(line.tsPct) : '—' },
          ]}
        />
        {!cur && line && lastSeason ? (
          <div className="tm-hero-note">
            {seasonLabel(lastSeason)} per game{p.stats.some((s) => s.season === lastSeason && s.real) ? ' (real)' : ''}
          </div>
        ) : null}
      </section>

      <div className="tm-tabs five">
        <Segmented
          tabs
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
      </div>

      {tab === 'overview' && (
        <>
          {/* a rostered player's mood: free agents, prospects and retired players have none to show */}
          {p.tid >= 0 && <Morale league={league} p={p} mine={mine} busyWhy={busyWhy} onMeet={() => setMeeting(true)} />}

          <Section
            title="Scouting profile"
            right={
              <Help title="Scouting profile">
                Each skill blends the ratings the game engine uses for it. The number is his percentile among every rostered NBA player: 90th means better than 90% of them.
              </Help>
            }
          >
            <div className="card tm-skills">
              {SKILLS.map((s) => {
                const pc = pctile(s.key, s.get(c, p));
                return (
                  <div key={s.key} className="tm-skill">
                    <span className="tm-skill-l">{s.label}</span>
                    <Bar value={pc} color={skillColor(pc)} />
                    <span className="num tm-skill-v">
                      {pc}
                      <span className="tm-sfx">{ordinalSuffix(pc)}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </Section>

          <div className="md-grid2">
            <Section
              title="Role & usage"
              right={
                mine && (
                  <span className="tm-links-r">
                    <button className="card-link" aria-haspopup="dialog" onClick={() => setRoleOpen(true)}>
                      Set role
                    </button>
                    <Link to="/team/rotation" className="card-link">
                      Minutes <ChevronRight size={14} />
                    </Link>
                  </span>
                )
              }
            >
              <div className="card tm-role">
                <div className="row between top">
                  <div className="grow">
                    <div className="tm-role-name">{ROLE_META[role].label}</div>
                    {arch.role !== role && <div className="small warn">Natural role: {ROLE_META[arch.role].label}</div>}
                  </div>
                  {freedom && freedom !== 'Normal' && <Tag tone={freedom === 'Green light' ? 'good' : 'warn'}>{freedom}</Tag>}
                </div>
                {usage.length > 0 && <Statline items={usage} />}
              </div>
            </Section>

            <Section title="Contract">
              <div className="card tm-deal">
                {p.tid >= 0 ? (
                  <>
                    <Statline
                      items={[
                        { k: 'Salary', v: fmtM(sal), s: seasonLabel(salSeason) },
                        {
                          k: extStart !== null ? 'Deal ends' : 'Expires',
                          v: shortSeason(extStart !== null ? extStart - 1 : contractExp(p.contract)),
                          s: openOption(league, p) ? `${openOption(league, p)} option` : rookieScaleDeal(p) ? 'rookie scale' : undefined,
                        },
                        { k: 'Market', v: fmtM(marketSalary(league, p)), s: 'value' },
                      ]}
                    />
                    {openOption(league, p) && rookieScaleDeal(p) && <div className="tm-deal-note">Rookie scale deal.</div>}
                    {extStart !== null && (
                      <div className="tm-deal-note">
                        <span className="good bold">Extended through {seasonLabel(contractExp(p.contract))}</span> · {fmtM(salaryFor(p, extStart))} from {shortSeason(extStart)}
                      </div>
                    )}
                    {p.contract.twoWay && (
                      <div className="tm-deal-note">
                        <Term id="twoway">Two-way</Term>: off the 15-man roster and the cap.
                      </div>
                    )}
                    {p.contract.tenDay && <div className="tm-deal-note">{tenDayLine(league, p)}</div>}
                    {p.rfa && (
                      <div className="tm-deal-note">
                        <Term id="qo">Qualifying offer</Term> out ({fmtM(p.rfa.qo)} for {seasonLabel(league.season + 1)}): restricted when free agency opens.
                      </div>
                    )}
                  </>
                ) : faAsk ? (
                  <>
                    <div className="tm-deal-note">
                      {p.waivers
                        ? `On waivers: any team can claim his contract until he clears ${p.waivers.until - league.day > 1 ? `in ${p.waivers.until - league.day} days` : 'tomorrow'}.`
                        : p.rfa?.sheet
                          ? `Signed an offer sheet with ${league.teams[p.rfa.sheet.tid].abbrev} (${sheetTerms(league, p)}). ${league.teams[p.rfa.tid].abbrev} can match until the end of ${deadlineLabel(p.rfa.sheet.until)}.`
                          : p.rfa?.tid === league.userTid
                            ? `Your restricted free agent: asking ${fmtM(faAsk.amount)} × ${faAsk.years} yr${faAsk.years === 1 ? '' : 's'}. Unsigned at the close, he takes his ${fmtM(p.rfa.qo)} qualifying offer.`
                            : p.rfa
                              ? `Restricted: ${league.teams[p.rfa.tid].abbrev} can match any offer sheet. Asking ${fmtM(faAsk.amount)} × ${faAsk.years} yr${faAsk.years === 1 ? '' : 's'} from you.`
                              : `Asking ${fmtM(faAsk.amount)} × ${faAsk.years} yr${faAsk.years === 1 ? '' : 's'} from you.`}
                    </div>
                    {/* straight to his offer (or claim) sheet on the Free Agents screen */}
                    {!p.rfa?.sheet && (
                      <Link className="btn sm primary tm-deal-go" to={`/office/free-agents?offer=${p.pid}`}>
                        {p.waivers ? 'Claim off waivers' : p.rfa?.tid === league.userTid ? 'Re-sign' : p.rfa ? 'Offer sheet' : 'Make an offer'}
                      </Link>
                    )}
                  </>
                ) : p.tid === DRAFT_PROSPECT ? (
                  <div className="tm-deal-note">Eligible for the {p.draft.year} draft.</div>
                ) : (
                  <div className="small dim">—</div>
                )}
                {mine ? (
                  <>
                    <div className="row wrap tm-acts">
                      {tradeWhy || simming ? (
                        <button className="btn sm" disabled>
                          <ArrowLeftRight size={15} /> Trade
                        </button>
                      ) : (
                        <Link className="btn sm" to={`/office/trade?give=${p.pid}`}>
                          <ArrowLeftRight size={15} /> Trade
                        </Link>
                      )}
                      {finalSeason && (
                        <button className="btn sm" disabled={!!extendWhy || simming} onClick={() => setExtending(true)}>
                          <PenLine size={15} /> Extend
                        </button>
                      )}
                      {p.contract.twoWay && (
                        <button className="btn sm" disabled={!!busyWhy || simming} onClick={convert}>
                          Convert to standard
                        </button>
                      )}
                      <button className="btn sm danger" disabled={!!releaseWhy || simming} onClick={() => setConfirmRelease(true)}>
                        Release
                      </button>
                    </div>
                    {whys && <div className="tm-why-line">{whys}</div>}
                    {p.contract.tenDay && <TenDayActions league={league} p={p} />}
                  </>
                ) : (
                  p.tid >= 0 &&
                  p.tid !== league.userTid && (
                    <div className="row tm-acts">
                      <Link className="btn sm" to={`/office/trade?with=${p.tid}&get=${p.pid}`}>
                        <ArrowLeftRight size={15} /> Trade for him
                      </Link>
                    </div>
                  )
                )}
              </div>
            </Section>
          </div>

          {/* the same honors, names and order as the league history (the Hall of Fame has its own tag above) */}
          {honors.length > 0 && (
            <Section title="Honors">
              <div className="tm-honors">
                {honors.map((a) => (
                  <span key={a.label} className={`tag ${a.gold ? 'tm-gold' : ''}`}>
                    {a.n > 1 ? `${a.n}× ` : ''}
                    {a.label}
                  </span>
                ))}
              </div>
            </Section>
          )}
          <PlayerMoves league={league} pid={p.pid} />
        </>
      )}

      {tab === 'ratings' && <RatingsTab p={p} league={league} />}
      {tab === 'stats' && <StatsTab p={p} league={league} />}
      {tab === 'log' && <GameLog p={p} league={league} onOpen={(gid) => nav(`/game/${gid}`)} />}
      {tab === 'dev' && <DevTab p={p} league={league} mine={mine} />}

      {/* (loaded the first time it opens) */}
      {editing && league.settings.godMode && <LazyPlayerEditor pid={p.pid} onClose={() => setEditing(false)} />}
      <Sheet open={roleOpen} onClose={() => setRoleOpen(false)} title={`${p.lastName}: role`}>
        <RoleEditor p={p} onDone={() => setRoleOpen(false)} />
      </Sheet>
      <Sheet open={confirmRelease && mine && !releaseWhy} onClose={() => setConfirmRelease(false)} title={`Release ${p.lastName}?`}>
        <div className="col" style={{ gap: 12 }}>
          <ReleaseConfirm league={league} p={p} onKeep={() => setConfirmRelease(false)} onDone={() => (setConfirmRelease(false), nav('/team'))} />
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

/**
 * His morale: how he feels, what it does to his play (the engine's own multipliers), what pulls his
 * mood up or down, and for your own player a promise that's running or a meeting to have.
 */
function Morale({ league, p, mine, busyWhy, onMeet }: { league: League; p: Player; mine: boolean; busyWhy: string | null; onMeet: () => void }) {
  const meta = moodMeta(p);
  const e = moraleEffect(league, p);
  const reasons = moodReasons(p);
  const room = roomLine(e);
  const meetWhy = busyWhy ?? meetBlockedReason(league, p);
  const minutesReason = reasons.some((r) => r.key === 'minutes' && r.v < 0);
  return (
    <Section
      title="Morale"
      right={
        <Help title="Morale">
          <p>
            His mood moves each week toward the sum of what pulls on it: his minutes against what he expects, winning, his role and his pay. The figures are each pull, from about
            −4 to +3.
          </p>
          <p>
            Mood changes how well he plays, from about 3% below his best when he&apos;s furious to 2% above it when he&apos;s ecstatic. Each teammate who has asked for a trade
            costs the others 0.6% (two at most). Mood also decides whether he re-signs, and an unhappy star can ask for a trade.
          </p>
          <p>Meet a player who is unhappy or has asked out: promise him a bigger role, a trade, or ask for patience.</p>
        </Help>
      }
    >
      <div className="card tm-morale">
        <div className="tm-morale-head" style={{ color: meta.color }}>
          <span className="tm-morale-ic" aria-hidden="true">
            {meta.emoji}
          </span>
          <span className="tm-morale-l">{p.mood.tradeRequest ? 'Wants a trade' : meta.label}</span>
        </div>
        <div className={`tm-morale-fx ${e.total < -0.0025 ? 'bad' : e.total > 0.0025 ? 'good' : ''}`}>
          {effectLine(e)}
          {room && <span className="dim"> · {room}</span>}
        </div>
        {reasons.length > 0 && (
          <ul className="tm-reasons" aria-label="What moves his mood">
            {reasons.map((r) => (
              <li key={r.key}>
                <span className="grow">{r.text}</span>
                <span className={`num ${r.v < 0 ? 'bad' : 'good'}`}>
                  {r.v > 0 ? '+' : '−'}
                  {Math.abs(r.v).toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {!minutesReason && p.mood.expectedMin > 0 && <div className="tm-why-line">Expects about {p.mood.expectedMin} minutes a night.</div>}
        {mine && p.promise && (
          <div className="tm-promise">
            <Clock size={15} aria-hidden="true" />
            <span className="grow">{promiseStatus(league, p)}</span>
          </div>
        )}
        {mine && !p.promise && wantsMeeting(p) && (
          <div className="row wrap tm-acts">
            <button className="btn sm primary" disabled={!!meetWhy} onClick={onMeet}>
              <MessageCircle size={15} /> Meet with him
            </button>
            {meetWhy && <span className="tm-why-line">{meetWhy}</span>}
          </div>
        )}
      </div>
    </Section>
  );
}

const RATING_GROUPS = ['Physical', 'Scoring', 'Playmaking', 'Defense', 'Rebounding'] as const;

/** Every rating on the 40-99 scale, by group, with last season's change; a tap opens what it does. */
function RatingsTab({ p, league }: { p: Player; league: League }) {
  const [open, setOpen] = useState<string | null>(null);
  const was = p.ratingsHistory.length > 1 ? p.ratingsHistory[p.ratingsHistory.length - 2].r : undefined;
  const contribs = ovrContributions(league, p);
  const pluses = contribs.parts.filter((x) => x.delta > 0).slice(0, 4);
  const minuses = contribs.parts
    .filter((x) => x.delta < 0)
    .slice(-3)
    .reverse();
  return (
    <>
      <Section title={`Why he's a ${p.ovr}`}>
        <div className="card tm-why">
          <div className="tm-why-sum">
            {contribs.gap === 0 ? 'Right at' : `${Math.abs(contribs.gap)} ${contribs.gap > 0 ? 'above' : 'below'}`} an average player ({AVERAGE_OVR} <Term id="ovr">OVR</Term>)
          </div>
          <div className="tm-why-cols">
            {[
              { title: 'Lifts him', list: pluses },
              { title: 'Holds him back', list: minuses },
            ].map((g) => (
              <div key={g.title} className="tm-why-col">
                <div className="over">{g.title}</div>
                {!g.list.length && <div className="tm-why-row dim">Nothing</div>}
                {g.list.map((x) => (
                  <div key={x.key} className="tm-why-row">
                    <span className="ellipsis">{x.label}</span>
                    <span className={`num ${x.delta > 0 ? 'good' : 'bad'}`}>
                      {x.delta > 0 ? '+' : ''}
                      {x.delta}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </Section>
      <div className="card flush">
        <div className="list">
          {RATING_GROUPS.map((g) => (
            <Fragment key={g}>
              <div className="list-divider">{g}</div>
              <div className="list wide2 tm-group">
                {RATING_META.filter((m) => m.group === g).map((m) => {
                  const val = attrDisplay(p.ratings[m.key as RatingKey]);
                  const before = was?.[m.key as RatingKey];
                  const prev = before === undefined ? null : attrDisplay(before);
                  const on = open === m.key;
                  return (
                    <div key={m.key} className="tm-rt">
                      <button className="tm-rt-row" onClick={() => setOpen(on ? null : m.key)} aria-expanded={on}>
                        <span className="tm-rt-l">{m.label}</span>
                        <Bar value={((val - 40) / 59) * 100} color={val >= 85 ? 'var(--tier-elite)' : val >= 75 ? 'var(--good)' : val >= 64 ? 'var(--info)' : 'var(--text-dim)'} />
                        <span className="tm-rt-v num">{val}</span>
                        <span className={`tm-rt-d num ${prev !== null && val !== prev ? (val > prev ? 'good' : 'bad') : ''}`}>
                          {prev !== null && val !== prev ? `${val > prev ? '+' : ''}${val - prev}` : ''}
                        </span>
                      </button>
                      {on && <div className="tm-rt-help fade-in">{m.help}</div>}
                    </div>
                  );
                })}
              </div>
            </Fragment>
          ))}
        </div>
      </div>
      <div className="tm-foot">Tap a rating for what it does. Changes are since last season.</div>
    </>
  );
}

const ADV_KEYS = new Set(['per', 'bpm', 'epm', 'ws', 'ws48']);

function StatsTab({ p, league }: { p: Player; league: League }) {
  const [po, setPo] = useState(false);
  const rows = seasonsOf(p).filter((r) => r.playoffs === po);
  type R = (typeof rows)[number];
  const pg = (r: R) => perGame(r.tot)!;
  const adv = (r: R) => advancedView(league, p, r.tot);
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
    { key: 'per', label: 'PER', get: (r) => adv(r)?.per ?? NaN, fmt: (v) => (isNaN(v as number) ? '—' : f1(v as number)) },
    { key: 'bpm', label: 'BPM', get: (r) => r.tot.adv?.bpm ?? NaN, fmt: (v) => (isNaN(v as number) ? '—' : signed(v as number)) },
    { key: 'epm', label: 'EPM', get: (r) => r.tot.adv?.epm ?? NaN, fmt: (v) => (isNaN(v as number) ? '—' : signed(v as number)) },
    { key: 'ws', label: 'WS', get: (r) => adv(r)?.ws ?? NaN, fmt: (v) => (isNaN(v as number) ? '—' : f1(v as number)) },
    { key: 'ws48', label: 'WS/48', get: (r) => adv(r)?.ws48 ?? NaN, fmt: (v) => (isNaN(v as number) ? '—' : (v as number).toFixed(3)) },
    // imported seasons carry no plus-minus: "—", not 0.0 (as in the league stats)
    { key: 'pm', label: '+/-', get: (r) => (r.tot.real && !r.tot.pm ? NaN : pg(r).pm), fmt: (v) => signed(v as number) },
  ];
  // the all-in-one numbers only where a season has them, as in the league stats: BPM and EPM come
  // with imported seasons alone, and a season played here has no PER or win shares in the playoffs
  const shown = cols.filter((c) => !ADV_KEYS.has(c.key) || rows.some((r) => Number.isFinite(c.get(r))));
  const real = p.stats.some((s) => s.real);
  return (
    <>
      <div className="tm-seg-l">
        <Segmented
          value={po ? 'po' : 'rs'}
          onChange={(v) => setPo(v === 'po')}
          label="Season type"
          options={[
            { id: 'rs', label: 'Regular season' },
            { id: 'po', label: 'Playoffs' },
          ]}
        />
      </div>
      {rows.length ? (
        <StatTable rows={rows} cols={shown} rowKey={(r) => r.key} />
      ) : (
        <div className="card">
          <Empty>{po ? 'No playoff games yet.' : 'No NBA games yet.'}</Empty>
        </div>
      )}
      <div className="tm-foot">
        {real ? (
          <More label="“real” seasons and advanced stats">
            <p className="tm-more-p">
              “real” seasons are imported from Basketball Reference, with EPM from Dunks & Threes; only they have BPM and EPM. PER and win shares for seasons played in this league
              are worked out from their box scores the way Basketball Reference does (not in the playoffs). +/- is only kept for simulated seasons.
            </p>
          </More>
        ) : (
          'PER and win shares come from each box score, as Basketball Reference works them (not in the playoffs).'
        )}
      </div>
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
    <Section title={whole ? 'Career highs' : `Highs since ${seasonLabel(since)}`}>
      <div className="card flush list">
        {REC_STATS.filter((k) => highs[k]).map((k) => {
          const h = careerHighOf(p, k)!;
          const text = `vs ${league.teams[h.opp]?.abbrev ?? '?'} · ${fmtDate(h.season, h.day, { month: 'short', day: 'numeric', year: 'numeric' })}`;
          const body = (
            <>
              <span className="tm-hi-v num">{h.v}</span>
              <span className="tm-hi-k">{REC_LABEL[k][0]}</span>
              <span className="tm-hi-when ellipsis">{text}</span>
            </>
          );
          return stored.has(h.gid) ? (
            <Link key={k} to={`/game/${h.gid}`} className="tm-hi">
              {body}
              <ChevronRight size={15} className="dim" />
            </Link>
          ) : (
            <div key={k} className="tm-hi">
              {body}
            </div>
          );
        })}
      </div>
    </Section>
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
  if (!rows.length)
    return (
      <div className="card">
        <Empty>No games this season.</Empty>
      </div>
    );
  type R = (typeof rows)[number];
  const cols: Col<R>[] = [
    {
      key: 'opp',
      label: 'Opp',
      left: true,
      sticky: true,
      get: (r) => r.g.gid,
      fmt: (_, r) => (
        <span className="tm-log-opp">
          {/* the Cup final is on a neutral floor: nobody's home */}
          <span className={`tm-wl ${r.won ? 'w' : 'l'}`}>{r.won ? 'W' : 'L'}</span> {r.home || neutralSite(r.g) ? 'vs' : '@'} {league.teams[r.opp.tid].abbrev}
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
  return (
    <Section title={`${seasonLabel(league.season)} · ${rows.length} game${rows.length === 1 ? '' : 's'}`}>
      <StatTable rows={rows} cols={cols} rowKey={(r) => r.g.gid} onRow={(r) => onOpen(r.g.gid)} />
    </Section>
  );
}

function DevTab({ p, league, mine }: { p: Player; league: League; mine: boolean }) {
  const hist = p.ratingsHistory;
  const age = playerAge(p, league.season);
  const busy = useStore((s) => !!s.sim);
  return (
    <>
      <Section title="Overall by season">
        <div className="card">
          {hist.length > 1 ? (
            <LineChart points={hist.map((h) => h.ovr)} labels={hist.map((h) => `'${String(h.season).slice(2)}`)} />
          ) : (
            <div className="small dim">
              History builds as seasons pass. Now {p.ovr} OVR, potential {p.pot}.
            </div>
          )}
        </div>
      </Section>
      <Section
        title="Outlook"
        right={
          <Help title="How players develop">
            Players follow age curves: skills and IQ improve into the late 20s, while speed and explosiveness peak around 24-27 and then decline. On top of that come a hidden
            personal growth tendency, coaching quality (coach + coaching budget), practice intensity, playing time for young players (25+ minutes helps), and each player's training
            focus.
          </Help>
        }
      >
        <div className="card tm-outlook">
          <div className="tm-outlook-l">
            {p.tid === RETIRED
              ? `Retired${p.retiredSeason ? ` after the ${seasonLabel(p.retiredSeason)} season` : ''}.`
              : age <= 22
                ? 'Young and raw: big jumps come with minutes and good coaching.'
                : age <= 26
                  ? 'Still improving, especially skills and decisions.'
                  : age <= 30
                    ? 'In his prime: skill gains offset early athletic decline.'
                    : age <= 33
                      ? 'Veteran: athleticism fades; IQ and shooting hold up.'
                      : 'Late career: steady decline; conditioning work slows it.'}
          </div>
          <Statline
            items={[
              { k: 'Age', v: age },
              { k: 'Potential', v: p.pot, s: p.pot > p.ovr ? `+${p.pot - p.ovr} to go` : 'reached' },
              ...(p.tid >= 0
                ? [{ k: 'Season wear', v: `${Math.round(p.wear)}/100`, s: p.wear > 50 ? 'needs rest' : 'fresh', color: p.wear > 50 ? 'var(--warn)' : undefined }]
                : []),
            ]}
          />
        </div>
      </Section>
      {mine && (
        <Section title="Training focus">
          <div className="card tm-train">
            <Chips
              label="Training focus"
              value={p.training}
              disabled={busy}
              onChange={(f: TrainingFocus) => edit((l) => void (l.players[p.pid].training = f))}
              options={(Object.keys(FOCUS_META) as TrainingFocus[]).map((k) => ({ id: k, label: FOCUS_META[k].label }))}
            />
            <div className="small dim">{FOCUS_META[p.training].help}</div>
          </div>
        </Section>
      )}
    </>
  );
}
