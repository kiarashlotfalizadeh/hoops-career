// Settings (/settings): you and the league's name, how the game plays, live games, help, the league
// file and god mode. Your career and job offers live in Office → Career; this links there.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Download, LogOut, Save, Trash2 } from 'lucide-react';
import { exportLeague } from '../../state/backup';
import { ImportButton } from '../components/ImportButton';
import type { Settings as GameSettings } from '../../core/types';
import { seasonLabel } from '../../core/constants';
import { plural } from '../../core/format';
import { deleteLeague } from '../../state/persistence';
import { seasonsInCharge } from '../../core/league/owner';
import { coachNameTaken, renameUserCoach } from '../../core/league/coaches';
import { guideOpen, showGuide } from '../../core/league/agenda';
import { edit } from '../../state/actions';
import { loopSetting, useLeague, useStore, type LoopSettings } from '../../state/store';
import { Help, More, PageHeader, Section, Segmented, Sheet, Toggle } from '../components/ui';
import { GlossarySheet } from '../components/Glossary';
import { DifficultyPicker } from '../components/DifficultyPicker';
import { BrandMark } from '../components/BrandMark';
import { GLOSSARY } from '../glossary';
import { LIVE_BREAKS, LIVE_SPEEDS, TEACHING_HELP, rememberTeaching } from '../settingsOptions';
import './settings.css';

const SPEEDS = LIVE_SPEEDS.map((s) => ({ id: String(s.id), label: s.label }));

export default function Settings() {
  const league = useLeague();
  const nav = useNavigate();
  const team = league.teams[league.userTid];
  const st = league.settings;
  const set = <K extends keyof GameSettings>(k: K, v: GameSettings[K]) => edit((l) => void (l.settings[k] = v));
  const setLoop = (k: keyof LoopSettings, v: boolean) => edit((l) => void (l.settings[k] = v));
  const [name, setName] = useState(league.name);
  const [coach, setCoach] = useState(league.coachName);
  const [sheet, setSheet] = useState<null | 'delete' | 'unsaved' | 'glossary'>(null);
  const [busy, setBusy] = useState(false);
  // settings wait for a sim (it plays on a copy of the league); leaving or deleting mid-sim would strand it
  const simming = useStore((s) => !!s.sim);
  const saveProblem = useStore((s) => s.saveProblem);

  const commitName = () => {
    const v = name.trim();
    if (!v || v === league.name || !edit((l) => void (l.name = v))) setName(league.name);
  };
  // the coach registry takes the new name too; no two head coaches in the league's history share one
  const commitCoach = () => {
    const v = coach.trim();
    if (v && v !== league.coachName && coachNameTaken(league, v)) useStore.getState().toast(`${v} is another head coach's name in this league.`, 'bad');
    else if (v && v !== league.coachName && edit((l) => void renameUserCoach(l, v))) return;
    setCoach(league.coachName);
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

  const setTeaching = (on: boolean) => {
    if (edit((l) => void (l.settings.teaching = on))) rememberTeaching(on);
  };

  const bringGuideBack = () => {
    if (!edit((l) => showGuide(l))) return;
    useStore.getState().toast('The guide is back on Today.', 'good');
    nav('/');
  };

  const seasonsIn = seasonsInCharge(league);
  const seasonsPlayed = league.season - league.startSeason + 1;
  const offers = league.jobOffers?.offers.length ?? 0;
  const career = league.fired
    ? `You were fired${offers ? ` · ${plural(offers, 'offer')}` : ''}`
    : `${team.region} ${team.name} · ${seasonsIn < 1 ? 'starts next season' : `season ${seasonsIn} in charge`}${offers ? ` · ${plural(offers, 'offer')}` : ''}`;
  // the guided first week: on Today now, or one tap from coming back while its weeks last
  const guideOn = guideOpen(league);
  const guideBack = !guideOn && guideOpen({ ...league, onboarding: { done: league.onboarding?.done ?? [], hidden: false } });
  const edits = league.godEdits ?? 0;

  return (
    <main className="page">
      <PageHeader title="Settings" sub={simming ? 'Changes wait for the sim to finish.' : undefined} back />

      <Section title="Profile">
        <fieldset className="card flush set-list" disabled={simming}>
          <label className="set-field">
            <span className="set-label">Coach</span>
            <input
              className="input"
              value={coach}
              maxLength={40}
              onChange={(e) => setCoach(e.target.value)}
              onBlur={commitCoach}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </label>
          <label className="set-field">
            <span className="set-label">League</span>
            <input
              className="input"
              value={name}
              maxLength={50}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </label>
          <Link to="/office/career" className="set-link">
            <span className="grow">
              <span className="set-link-t">Career and job offers</span>
              <span className={`set-link-m ${league.fired ? 'bad' : ''}`}>{career}</span>
            </span>
            <ChevronRight size={18} className="dim" aria-hidden="true" />
          </Link>
        </fieldset>
        <div className="set-facts">
          Started {seasonLabel(league.startSeason)} · {plural(seasonsPlayed, 'season')} · {Object.values(league.players).filter((p) => p.tid >= 0).length} players under contract
        </div>
      </Section>

      <Section title="Gameplay">
        <fieldset className="card flush set-list" disabled={simming}>
          <DifficultyPicker value={st.difficulty} onChange={(d) => set('difficulty', d)} />
          <Toggle
            on={st.injuries}
            onChange={(v) => set('injuries', v)}
            label="Injuries"
            help="Fatigue, age and history raise the risk. Off stops new injuries; the hurt still heal."
          />
          <Toggle
            on={st.jobSecurity}
            onChange={(v) => set('jobSecurity', v)}
            label="Job security"
            help="After his grace period (Difficulty sets how long), the owner can fire you for a season short of his goals. Off, he never does."
          />
          <Toggle
            on={st.moments !== false}
            onChange={(v) => set('moments', v)}
            label="Big moments"
            help="A clinch, a title, your draft pick, a big signing, an award or a front-page story about your team takes the screen for a moment. A long sim ends on one story at most, the biggest."
          />
        </fieldset>
      </Section>

      <Section title="Sims">
        <fieldset className="card flush set-list" disabled={simming}>
          <Toggle
            on={st.stopOnNews !== false}
            onChange={(v) => set('stopOnNews', v)}
            label="Pause sims for big news"
            help="A trade request, a month-long injury to a top-six player or an owner verdict stops a long sim (any sim but one of a set number of days). Off, the two below are off too."
          />
          <Toggle
            on={st.stopOnNews !== false && loopSetting(league, 'stopOnFrontPage')}
            onChange={(v) => setLoop('stopOnFrontPage', v)}
            disabled={st.stopOnNews === false}
            label="Pause for front-page news"
            help="A front-page story about your team (a milestone, an honor, a career night, a long streak) stops a long sim."
          />
          <Toggle
            on={st.stopOnNews !== false && loopSetting(league, 'stopForBigGames')}
            onChange={(v) => setLoop('stopForBigGames', v)}
            disabled={st.stopOnNews === false}
            label="Pause before your biggest games"
            help="A long sim stops on the morning of one of the season's biggest nights for you, so you can coach it."
          />
          <Toggle
            on={loopSetting(league, 'digest')}
            onChange={(v) => setLoop('digest', v)}
            label="While you were away"
            help="After a sim of more than a day, a digest of what happened opens first: your results and their headlines, your team's stories, the standings, injuries, new mail and the league's top stories. Off, it waits on Today."
          />
        </fieldset>
      </Section>

      <Section title="Live games">
        <fieldset className="card flush set-list" disabled={simming}>
          <div className="set-inline">
            <span className="set-label">Speed</span>
            <Segmented label="Live game speed" value={String(st.liveSpeed || 1)} onChange={(v) => set('liveSpeed', Number(v))} options={SPEEDS} />
          </div>
          <div className="set-inline">
            <span className="set-label row">
              Breaks
              <Help title="Breaks">Where a live game stops with a period report and time to adjust.</Help>
            </span>
            <Segmented label="Live game breaks" value={st.liveBreaks ?? 'quarters'} onChange={(b) => set('liveBreaks', b)} options={LIVE_BREAKS} />
          </div>
          <Toggle
            on={st.pregame !== false}
            onChange={(v) => set('pregame', v)}
            label="Pre-game screen"
            help="Watch & coach opens the matchup preview first. Watch & coach live in the Play options goes straight to the game."
          />
          <Toggle
            on={st.liveIntro !== false}
            onChange={(v) => set('liveIntro', v)}
            label="Starting lineups"
            help="Both fives on the court before the tip. Tap the court to skip."
          />
          <Toggle
            on={st.liveWinProb !== false}
            onChange={(v) => set('liveWinProb', v)}
            label="Win probability"
            help="On the scorebug, the Flow tab and at the breaks. Game reports always show it."
          />
          <Toggle
            on={st.liveScores !== false}
            onChange={(v) => set('liveScores', v)}
            label="Scores around the league"
            help="The night's other games tick along under the scorebug, the ones that matter first."
          />
          <Toggle
            on={st.liveStaff === 'auto'}
            onChange={(v) => set('liveStaff', v ? 'auto' : 'ask')}
            label="Staff makes tactics calls"
            help="In live games your lead assistant makes the tactics changes he would bring you himself, and they show in your moves. Subs and timeouts stay yours. Off: each one comes to you first."
          />
        </fieldset>
      </Section>

      <Section title="Help">
        <div className="card flush set-list">
          <Toggle on={st.teaching !== false} onChange={setTeaching} disabled={simming} label="Teaching" help={TEACHING_HELP} />
          <button type="button" className="set-link" aria-haspopup="dialog" onClick={() => setSheet('glossary')}>
            <span className="grow">
              <span className="set-link-t">Glossary</span>
              <span className="set-link-m">{GLOSSARY.length} terms, from drop coverage to the MLE</span>
            </span>
            <ChevronRight size={18} className="dim" aria-hidden="true" />
          </button>
          {guideOn ? (
            <Link to="/" className="set-link">
              <span className="grow">
                <span className="set-link-t">First-week guide</span>
                <span className="set-link-m">On Today now</span>
              </span>
              <ChevronRight size={18} className="dim" aria-hidden="true" />
            </Link>
          ) : guideBack ? (
            <button type="button" className="set-link" disabled={simming} onClick={bringGuideBack}>
              <span className="grow">
                <span className="set-link-t">Show the first-week guide again</span>
                <span className="set-link-m">Through your first three weeks</span>
              </span>
            </button>
          ) : null}
          <div className="set-about">
            <BrandMark size={22} className="set-mark" />
            <div className="grow">
              <div className="set-word">
                Hoops <em>Career</em>
              </div>
              {/* a build hash keeps its own case */}
              <div className="set-link-m num">
                v{__APP_VERSION__} · {__APP_BUILD__} · save format {league.version}
              </div>
              <More label="Data sources">
                <div className="col small dim2" style={{ gap: 8 }}>
                  <p className="set-p">
                    Rosters and salaries come from Basketball Reference's contracts page; the 2026-27 schedule and NBA Cup groups from NBA.com, future pick ownership from RealGM
                    and opening-night injuries from ESPN's injury report. Ratings are built from 2023-24 to 2025-26 per-game and advanced stats (Basketball Reference), NBA.com
                    play-by-play, lineup and matchup data (shot zones, shot creation, adjusted plus-minus), and college box scores for rookies, then calibrated in the engine.
                    Fictional leagues use generated players.
                  </p>
                  <p className="set-p tiny dim">Team marks are original monograms in public team colors. Not affiliated with the NBA or its teams.</p>
                </div>
              </More>
            </div>
          </div>
        </div>
      </Section>

      <Section
        title={
          <h3>
            League file
            <Help title="League file">
              <p>Saved on this device after every change, and nowhere else: clearing site data or uninstalling deletes it.</p>
              <p>Export a backup to keep a copy or move the league to another device.</p>
            </Help>
          </h3>
        }
      >
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
        <button className="btn danger block" disabled={simming} onClick={() => setSheet('delete')}>
          <Trash2 size={17} /> Delete league
        </button>
      </Section>

      <Section title="God mode">
        <fieldset className="card flush set-list" disabled={simming}>
          <Toggle
            on={!!st.godMode}
            onChange={(v) => set('godMode', v)}
            label="God mode"
            help="Edit any player or team, create players and force trades. Your edits stay when it's off."
          />
          {st.godMode ? (
            <Link to="/god" className="set-link">
              <span className="grow">
                <span className="set-link-t">Open the editor</span>
                <span className="set-link-m">{edits ? `${plural(edits, 'edit')} in this league` : 'No edits yet'}</span>
              </span>
              <ChevronRight size={18} className="dim" aria-hidden="true" />
            </Link>
          ) : edits ? (
            // an edited league says so, whether god mode is on now or not
            <div className="set-link-m">{plural(edits, 'god-mode edit')} in this league</div>
          ) : null}
        </fieldset>
      </Section>

      <GlossarySheet open={sheet === 'glossary'} onClose={() => setSheet(null)} />

      <Sheet open={sheet === 'delete'} onClose={() => setSheet(null)} title="Delete league?">
        <div className="col" style={{ gap: 12 }}>
          <div className="dim2">
            “{league.name}” and its {plural(seasonsPlayed, 'season')} of history leave this device for good. This can't be undone.
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
