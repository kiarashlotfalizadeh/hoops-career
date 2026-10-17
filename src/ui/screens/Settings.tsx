import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Database, Download, HardDrive, LogOut, Save, Shuffle, Trash2, TriangleAlert, Wand2 } from 'lucide-react';
import { exportLeague } from '../../state/backup';
import { ImportButton } from '../components/ImportButton';
import type { League } from '../../core/types';
import { PHASE_LABEL, seasonLabel } from '../../core/constants';
import { CAP_FOR, curTeamSeason, payroll, teamPlayers } from '../../core/league/helpers';
import { contractExp } from '../../core/playerGen';
import { deleteLeague } from '../../state/persistence';
import { seasonsInCharge } from '../../core/league/owner';
import { declineJob, takeJob, type JobOffer } from '../../core/league/jobs';
import { coachNameTaken, renameUserCoach } from '../../core/league/coaches';
import { useLeague, useStore } from '../../state/store';
import { TeamLogo } from '../components/TeamLogo';
import { Chips, More, PageHeader, Section, Segmented, Sheet, Toggle } from '../components/ui';
import { BrandMark } from '../components/BrandMark';
import { slabVars } from '../teamColors';
import './start.css';
import './settings.css';
import { STRATEGY_META, capSeason, fmtM, shortSeason } from '../office/common';
import { COMPLEXITY, DIFFICULTY, LIVE_SPEEDS, helpFor } from '../settingsOptions';

export default function Settings() {
  const league = useLeague();
  const nav = useNavigate();
  const team = league.teams[league.userTid];
  const st = league.settings;
  const mutate = (fn: (l: League) => void) => useStore.getState().mutate(fn);
  const [name, setName] = useState(league.name);
  const [coach, setCoach] = useState(league.coachName);
  const [params, setParams] = useSearchParams();
  const [sheet, setSheet] = useState<null | 'switch' | 'delete' | 'unsaved'>(null);
  // "Find a new job" (Play menu, Home) opens the team picker, also when Settings is already open;
  // the request is then cleared, so Back doesn't open it again
  useEffect(() => {
    if (params.get('sheet') !== 'switch') return;
    setSheet('switch');
    setParams({}, { replace: true });
  }, [params, setParams]);
  const [busy, setBusy] = useState(false);
  // leaving or swapping leagues mid-sim would strand the sim on a league nobody sees
  const simming = useStore((s) => !!s.sim);
  const saveProblem = useStore((s) => s.saveProblem);

  const commitName = () => {
    const v = name.trim();
    if (v && v !== league.name) mutate((l) => (l.name = v));
    else setName(league.name);
  };
  // the coach registry takes the new name too; no two head coaches in the league's history share one
  const commitCoach = () => {
    const v = coach.trim();
    if (v && v !== league.coachName && !coachNameTaken(league, v)) mutate((l) => void renameUserCoach(l, v));
    else {
      if (v && v !== league.coachName) useStore.getState().toast(`${v} is another head coach's name in this league.`, 'bad');
      setCoach(league.coachName);
    }
  };

  const saveNow = async () => {
    setBusy(true);
    // (flush: a live game in progress goes in as far as it has got)
    const ok = await useStore.getState().flush();
    setBusy(false);
    const problem = useStore.getState().saveProblem;
    useStore.getState().toast(ok ? 'Saved to this device.' : `Not saved. ${problem?.text ?? ''}`, ok ? 'good' : 'bad');
  };

  const leave = () => {
    setSheet(null);
    nav('/start');
    useStore.getState().setLeague(null);
  };

  const exit = async () => {
    setBusy(true);
    // (a live game in progress is brought up to date first, as every other way out of a league does)
    const ok = await useStore.getState().saveBeforeLeaving();
    setBusy(false);
    // the league only lives in this window until a save works (a newer copy from another window is fine to drop)
    if (ok) leave();
    else setSheet('unsaved');
  };

  const backup = () =>
    void exportLeague(league).catch((e) => {
      console.error(e);
      useStore.getState().toast('Export failed.', 'bad');
    });

  const remove = async () => {
    const id = league.id;
    const nm = league.name;
    leave();
    try {
      await deleteLeague(id);
      useStore.getState().toast(`"${nm}" deleted.`, 'neutral');
    } catch (e) {
      console.error(e);
      useStore.getState().toast(`"${nm}" could not be deleted. Try again from the main menu.`, 'bad');
    }
  };

  const seasonsIn = seasonsInCharge(league);
  const seasonsPlayed = league.season - league.startSeason + 1;

  return (
    <main className="page">
      <PageHeader title="Settings" sub={`${league.name} · ${seasonLabel(league.season)}`} back />

      {league.fired && (
        <div className="card set-fired" role="alert">
          <TriangleAlert size={18} className="bad" />
          <div className="grow small">
            <b>You were fired.</b>{' '}
            {league.jobOffers?.offers.length
              ? `${league.jobOffers.offers.length === 1 ? 'A team wants' : `${league.jobOffers.offers.length} teams want`} you: take a job to keep going.`
              : 'Take over another team to keep going.'}
          </div>
          <button className="btn xs" onClick={() => setSheet('switch')}>
            Find a new job
          </button>
        </div>
      )}

      <section className="slab set-career" aria-label="Your career">
        <span className="slab-mark">
          <TeamLogo tid={team.tid} size={160} decorative />
        </span>
        <span className="set-over">Your career</span>
        <div className="row" style={{ gap: 12 }}>
          <TeamLogo tid={team.tid} size={46} decorative />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="set-team ellipsis">
              {team.region} {team.name}
            </div>
            <div className="small dim2">
              {/* a team taken over after the season is his from the next one */}
              {PHASE_LABEL[league.phase]} · {seasonsIn < 1 ? 'your tenure starts next season' : `season ${seasonsIn} in charge`}
            </div>
          </div>
        </div>
      </section>

      <Section title="Profile">
        <div className="card col set-fields">
          <label className="col">
            <span className="over">Coach / GM name</span>
            <input
              className="input"
              value={coach}
              maxLength={40}
              onChange={(e) => setCoach(e.target.value)}
              onBlur={commitCoach}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </label>
          <label className="col">
            <span className="over">League name</span>
            <input
              className="input"
              value={name}
              maxLength={50}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </label>
          <div className="set-facts tiny dim">
            <span>Started {seasonLabel(league.startSeason)}</span>
            <span>{Object.values(league.players).filter((p) => p.tid >= 0).length} players under contract</span>
            <span>Save format v{league.version}</span>
            {/* an edited league says so, whether god mode is on now or not */}
            {league.godEdits ? (
              <span>
                {league.godEdits} god-mode edit{league.godEdits === 1 ? '' : 's'}
              </span>
            ) : null}
          </div>
        </div>
      </Section>

      <Section title="Gameplay">
        <div className="card col set-group">
          <div className="col set-item">
            <div className="set-label">Difficulty</div>
            <Chips label="Difficulty" value={st.difficulty} onChange={(d) => mutate((l) => (l.settings.difficulty = d))} options={DIFFICULTY} />
            <div className="small dim">{helpFor(DIFFICULTY, st.difficulty)}</div>
          </div>
          <div className="col set-item">
            <div className="set-label">Coaching depth</div>
            <Chips label="Coaching depth" value={st.complexity} onChange={(c) => mutate((l) => (l.settings.complexity = c))} options={COMPLEXITY} />
            <div className="small dim">{helpFor(COMPLEXITY, st.complexity)} Only what the Tactics screens show changes; your game plan stays.</div>
          </div>
          <Toggle
            on={st.injuries}
            onChange={(v) => mutate((l) => (l.settings.injuries = v))}
            label="Injuries"
            help="Fatigue, age and history raise the risk. Off stops new injuries; the hurt still heal."
          />
          <Toggle
            on={st.jobSecurity}
            onChange={(v) => mutate((l) => (l.settings.jobSecurity = v))}
            label="Job security"
            help="The owner can fire you after repeated seasons short of his goals (never in your first two)."
          />
          <Toggle
            on={st.stopOnNews !== false}
            onChange={(v) => mutate((l) => (l.settings.stopOnNews = v))}
            label="Pause sims for big news"
            help="A trade request, a month-long injury to a top-six player or an owner verdict stops a long sim."
          />
          <Toggle
            on={st.moments !== false}
            onChange={(v) => mutate((l) => (l.settings.moments = v))}
            label="Big moments"
            help="A clinch, a title, your draft pick, a big signing or an award takes the screen for a moment."
          />
        </div>
      </Section>

      <Section title="Live games">
        <div className="card col set-group">
          <div className="col set-item">
            <div className="set-label">Speed</div>
            <Chips label="Live game speed" value={st.liveSpeed || 1} onChange={(s) => mutate((l) => (l.settings.liveSpeed = s))} options={LIVE_SPEEDS} />
          </div>
          <div className="col set-item">
            <div className="set-label">Breaks</div>
            <Chips
              label="Live game breaks"
              value={st.liveBreaks ?? 'quarters'}
              onChange={(b) => mutate((l) => (l.settings.liveBreaks = b))}
              options={[
                { id: 'quarters', label: 'Every quarter' },
                { id: 'half', label: 'Halftime' },
                { id: 'off', label: 'None' },
              ]}
            />
            <div className="small dim">Where the game stops with a period report and time to adjust.</div>
          </div>
          <Toggle
            on={st.pregame !== false}
            onChange={(v) => mutate((l) => (l.settings.pregame = v))}
            label="Pre-game screen"
            help="Watch & coach opens the matchup preview first. Watch & coach live in the Play options goes straight to the game."
          />
          <Toggle
            on={st.liveIntro !== false}
            onChange={(v) => mutate((l) => (l.settings.liveIntro = v))}
            label="Starting lineups at tip-off"
            help="Both fives on the court before the tip. Tap the court to skip."
          />
          <Toggle
            on={st.liveWinProb !== false}
            onChange={(v) => mutate((l) => (l.settings.liveWinProb = v))}
            label="Win probability in live games"
            help="On the scorebug, the Flow tab and at the breaks. Game reports always show it."
          />
          <Toggle
            on={st.liveReplays !== false}
            onChange={(v) => mutate((l) => (l.settings.liveReplays = v))}
            label="Instant replays"
            help="Buzzer-beaters and game-winners replay once in slow motion. Any play replays from the pause button."
          />
          <Toggle
            on={st.liveScores !== false}
            onChange={(v) => mutate((l) => (l.settings.liveScores = v))}
            label="Scores around the league"
            help="The night's other games tick along under the scorebug, the ones that matter first."
          />
        </div>
      </Section>

      <Section title="God mode">
        <div className="card col set-group">
          <Toggle
            on={!!st.godMode}
            onChange={(v) => mutate((l) => (l.settings.godMode = v))}
            label="God mode"
            help="Edit any player or team, create players and force trades. Your edits stay when it's off."
          />
          {st.godMode && (
            <div>
              <Link to="/god" className="btn sm">
                <Wand2 size={16} /> Open the editor
              </Link>
            </div>
          )}
        </div>
      </Section>

      <Section title="League file">
        <div className="card col set-group">
          <div className="small dim2">Autosaved on this device after every change. Export a backup to keep it safe or move it to another device.</div>
          <div className="col" style={{ gap: 8 }}>
            <div className="grid2">
              <button className="btn" disabled={busy} onClick={backup}>
                <Download size={17} /> Export backup
              </button>
              <ImportButton />
              <button className="btn" disabled={busy} onClick={() => void saveNow()}>
                <Save size={17} /> Save now
              </button>
              <button className="btn" disabled={busy || simming} onClick={() => void exit()}>
                <LogOut size={17} /> Main menu
              </button>
            </div>
            <button className="btn block" disabled={simming} onClick={() => setSheet('switch')}>
              <Shuffle size={17} /> Switch team
            </button>
            <button className="btn danger block" disabled={simming} onClick={() => setSheet('delete')}>
              <Trash2 size={17} /> Delete league
            </button>
            {simming && <div className="tiny dim">Main menu, Switch team and Delete league wait for the sim to stop.</div>}
          </div>
        </div>
      </Section>

      <Section title="About">
        <div className="card col set-group">
          <div className="row" style={{ gap: 12 }}>
            <BrandMark size={44} />
            <div className="grow">
              <div className="set-team">Hoops Career</div>
              {/* a build hash keeps its own case */}
              <div className="tiny dim num" style={{ textTransform: 'none' }}>
                v{__APP_VERSION__} · {__APP_BUILD__}
              </div>
            </div>
          </div>
          <div className="row top set-about">
            <HardDrive size={18} className="dim" />
            <div className="small dim2">Leagues are stored only on this device. Nothing is uploaded; clearing site data or uninstalling deletes them.</div>
          </div>
          <div className="row top set-about">
            <Database size={18} className="dim" />
            <div className="grow small dim2">
              Real rosters, contracts, schedule, picks and injuries; ratings built from three seasons of data.
              <More label="Data sources">
                <div className="small dim2">
                  Rosters and salaries come from Basketball Reference's contracts page; the 2026-27 schedule and NBA Cup groups from NBA.com, future pick ownership from RealGM and
                  opening-night injuries from ESPN's injury report. Ratings are built from 2023-24 to 2025-26 per-game and advanced stats (Basketball Reference), NBA.com
                  play-by-play, lineup and matchup data (shot zones, shot creation, adjusted plus-minus), and college box scores for rookies, then calibrated in the engine.
                  Fictional leagues use generated players.
                </div>
              </More>
            </div>
          </div>
          <div className="tiny dim">Team marks are original monograms in public team colors. Not affiliated with the NBA or its teams.</div>
        </div>
      </Section>

      <SwitchTeamSheet open={sheet === 'switch'} onClose={() => setSheet(null)} />

      <Sheet open={sheet === 'delete'} onClose={() => setSheet(null)} title="Delete league?">
        <div className="col" style={{ gap: 12 }}>
          <div className="dim2">
            “{league.name}” and its {seasonsPlayed} season{seasonsPlayed > 1 ? 's' : ''} of history leave this device for good. This can't be undone.
          </div>
          <div className="row">
            <button className="btn grow" onClick={() => setSheet(null)}>
              Cancel
            </button>
            <button className="btn danger grow" onClick={() => void remove()}>
              <Trash2 size={16} /> Delete
            </button>
          </div>
        </div>
      </Sheet>

      <Sheet open={sheet === 'unsaved'} onClose={() => setSheet(null)} title="Leave without saving?">
        <div className="col" style={{ gap: 12 }}>
          <div className="dim2">{saveProblem?.text} Your latest changes are only in this window: export a backup to keep them.</div>
          <button className="btn primary block" onClick={backup}>
            <Download size={16} /> Export backup
          </button>
          <div className="row">
            <button className="btn grow" onClick={() => setSheet(null)}>
              Stay
            </button>
            <button className="btn danger grow" onClick={leave}>
              Leave anyway
            </button>
          </div>
        </div>
      </Sheet>
    </main>
  );
}

function SwitchTeamSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const league = useLeague();
  const nav = useNavigate();
  const cur = league.teams[league.userTid];
  const [conf, setConf] = useState<'E' | 'W'>(cur.conf);
  const [pick, setPick] = useState<number | null>(null);
  const t = pick !== null ? league.teams[pick] : null;
  const books = capSeason(league);
  // (the sheet also opens from "Find a new job" links, which a running sim doesn't disable)
  const simming = useStore((s) => !!s.sim);

  const take = (tid = pick) => {
    if (tid === null || simming) return;
    const target = league.teams[tid];
    let err: string | null = null;
    useStore.getState().mutate((l) => void (err = takeJob(l, tid)));
    if (err) return useStore.getState().toast(err, 'bad');
    useStore.getState().toast(`Welcome to the ${target.region} ${target.name}, Coach.`, 'good');
    onClose();
    setPick(null);
    nav('/');
  };
  const offers = league.jobOffers?.offers ?? [];

  return (
    <Sheet open={open} onClose={onClose} title={offers.length ? 'Job market' : 'Take over another team'}>
      <div className="col" style={{ gap: 12 }}>
        {offers.length > 0 && (
          <>
            <div className="small dim2">
              {league.fired ? 'Teams that want you after the carousel: ' : 'Teams calling about their openings: '}their offers stand until the draft.
            </div>
            {offers.map((o) => (
              <OfferCard key={o.tid} league={league} o={o} busy={simming} onTake={() => take(o.tid)} onDecline={() => useStore.getState().mutate((l) => declineJob(l, o.tid))} />
            ))}
            <div className="over">Or take over any team</div>
          </>
        )}
        <div className="small dim2">
          The {cur.name} go back to the AI staff and the new owner sets his goals.
          <More label="What carries over">
            <div className="small dim2">
              Your owner mood resets to neutral and the new owner sets his goals: in season from that day (in the playoffs, the next round), otherwise on opening night. The season,
              finances and league history carry on.
            </div>
          </More>
        </div>
        <Segmented
          value={conf}
          onChange={setConf}
          label="Conference"
          options={[
            { id: 'E', label: 'East' },
            { id: 'W', label: 'West' },
          ]}
        />
        <div className="nl-grid">
          {league.teams
            .filter((x) => x.conf === conf)
            .map((x) => {
              const ts = curTeamSeason(league, x.tid);
              const me = x.tid === league.userTid;
              return (
                <button
                  key={x.tid}
                  className={`nl-team ${pick === x.tid ? 'on' : ''}`}
                  aria-pressed={pick === x.tid}
                  disabled={me}
                  style={pick === x.tid ? slabVars(x.colors) : me ? { opacity: 0.45 } : undefined}
                  onClick={() => setPick(x.tid)}
                >
                  <TeamLogo tid={x.tid} size={38} decorative />
                  <span className="nl-team-name">{x.name}</span>
                  <span className="nl-team-sub num">{me ? 'Current' : `${ts.won}-${ts.lost}`}</span>
                </button>
              );
            })}
        </div>
        <div
          className="col"
          style={{
            gap: 10,
            position: 'sticky',
            bottom: 'calc(-20px - var(--safe-b))',
            background: 'var(--bg-2)',
            padding: '10px 0 calc(16px + var(--safe-b))',
            margin: '0 0 calc(-20px - var(--safe-b))',
            borderTop: '1px solid var(--line)',
          }}
        >
          {t && (
            <div className="card tight">
              <div className="row" style={{ gap: 10 }}>
                <TeamLogo tid={t.tid} size={36} decorative />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="bold ellipsis">
                    {t.region} {t.name}
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <span className={`tag ${STRATEGY_META[t.strategy].tone}`}>{STRATEGY_META[t.strategy].label}</span>
                    <span className="tiny dim">
                      {/* the books he'd inherit: next season's after this one ends, as on the Office cap sheet */}
                      {teamPlayers(league, t.tid).filter((p) => contractExp(p.contract) >= books).length} players · {books > league.season ? `${shortSeason(books)} ` : ''}payroll{' '}
                      {fmtM(payroll(league, t.tid, books))} / cap {fmtM(CAP_FOR(league, books).salaryCap)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
          {simming && <div className="tiny dim">Taking a job waits for the simulation to stop.</div>}
          <div className="row">
            <button className="btn grow" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary grow" disabled={pick === null || simming} onClick={() => take()}>
              {t ? `Take over ${t.abbrev}` : 'Pick a team'}
            </button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

/** One team's offer: who they are, where they stand and what the job is, with the user's two choices. */
function OfferCard({ league, o, busy, onTake, onDecline }: { league: League; o: JobOffer; busy: boolean; onTake: () => void; onDecline: () => void }) {
  const t = league.teams[o.tid];
  const books = capSeason(league);
  return (
    <div className="card tight">
      <div className="row" style={{ gap: 10 }}>
        <TeamLogo tid={t.tid} size={36} decorative />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="bold ellipsis">
            {t.region} {t.name}
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            <span className={`tag ${STRATEGY_META[t.strategy].tone}`}>{STRATEGY_META[t.strategy].label}</span>
            <span className="tiny dim">
              {fmtM(payroll(league, t.tid, books))} payroll{books > league.season ? ` for ${shortSeason(books)}` : ''}
            </span>
          </div>
        </div>
      </div>
      <div className="small dim2" style={{ marginTop: 8 }}>
        {o.note}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn grow" onClick={onDecline}>
          Decline
        </button>
        <button className="btn primary grow" disabled={busy} onClick={onTake}>
          Take the job
        </button>
      </div>
    </div>
  );
}
