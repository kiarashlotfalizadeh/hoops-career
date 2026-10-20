import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, ChevronLeft, Database, Shuffle } from 'lucide-react';
import { FRANCHISES, BBREF_TO_TID } from '../../core/teams';
import { rankOf } from '../../core/format';
import { TeamLogo } from '../components/TeamLogo';
import { More, Ovr, Section, Segmented, Spinner, Toggle } from '../components/ui';
import { DifficultyPicker } from '../components/DifficultyPicker';
import { TEACHING_HELP, rememberTeaching, teachingDefault } from '../settingsOptions';
import { slabVars } from '../teamColors';
import './start.css';
import { loadSeed } from '../../data/seedLoader';
import type { SeedData } from '../../core/league/create';
import { createLeague, defaultSettings } from '../../core/league/create';
import { buildOvrScale, ovrRaw, toDisplay } from '../../core/ratings';
import { useStore } from '../../state/store';
import type { Settings } from '../../core/types';
import { UnsavedSheet } from '../components/UnsavedSheet';
import { canGoBack } from '../nav';
import { rosterLine, seedRosterSizes } from '../newLeague';

type Step = 'type' | 'team' | 'setup';

const market = (pop: number) => (pop >= 9 ? 'Huge' : pop >= 5 ? 'Large' : pop >= 2.5 ? 'Mid-size' : 'Small');

export default function NewLeague() {
  const nav = useNavigate();
  const setLeague = useStore((s) => s.setLeague);
  const [seed, setSeed] = useState<SeedData | null>(null);
  const [seedLoaded, setSeedLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  // steps live in the URL so the system Back button walks back through them, and the choices with
  // them, so Back or a reload can't quietly switch your league or team
  const [sp, setSp] = useSearchParams();
  const choose = (patch: Record<string, string | null>, push = false) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setSp(next, { replace: !push });
  };
  // a build without roster data can only make a fictional league
  const kind: 'real' | 'fictional' = sp.get('kind') === 'fictional' || (seedLoaded && !seed && !loadFailed) ? 'fictional' : 'real';
  const setKind = (k: 'real' | 'fictional') => choose({ kind: k === 'real' ? null : k });
  // no tid: the default pick; an empty one: none, after switching to the other conference
  const tidParam = sp.get('tid');
  const tid: number | null = tidParam === null ? 19 : tidParam !== '' && FRANCHISES[Number(tidParam)] ? Number(tidParam) : null;
  const setTid = (t: number) => choose({ tid: String(t) });
  const asked = sp.get('step');
  const step: Step = asked === 'team' || (asked === 'setup' && tid !== null) ? asked : asked === 'setup' ? 'team' : 'type';
  const setStep = (st: Step) => choose({ step: st === 'type' ? null : st }, true);
  // back through the history (the main menu is behind the first step), and without any (a deep link or
  // a reload) to the step before, or the main menu in place of this screen
  const back = () => {
    if (canGoBack()) nav(-1);
    else if (step === 'type') nav('/start', { replace: true });
    else setStep(step === 'setup' ? 'team' : 'type');
  };
  const [conf, setConf] = useState<'E' | 'W'>(() => (tid !== null ? FRANCHISES[tid].conf : 'E'));
  const [name, setName] = useState('My League');
  const [coach, setCoach] = useState('');
  const [settings, setSettings] = useState<Settings>(() => ({ ...defaultSettings(), teaching: teachingDefault() }));
  const [busy, setBusy] = useState(false);
  // the league still open behind the main menu couldn't be saved: the user decides before it's replaced
  const [unsaved, setUnsaved] = useState(false);

  useEffect(() => {
    loadSeed()
      .then((s) => setSeed(s.players.length ? s : null))
      // keep the choice: a league quietly turning fictional would be worse than a clear note (opening New League again retries)
      .catch((e) => {
        console.error(e);
        setLoadFailed(true);
      })
      .finally(() => setSeedLoaded(true));
  }, []);

  // real rosters only: a fictional league's players are generated when it is created
  const teamInfo = useMemo(() => {
    if (!seed || kind !== 'real') return null;
    const rostered = seed.players.filter((p) => p.team);
    const scale = buildOvrScale(rostered.map((p) => ovrRaw(p.ratings)));
    const by: Record<number, { name: string; ovr: number }[]> = {};
    for (const p of rostered) {
      const t = BBREF_TO_TID[p.team!];
      if (t === undefined) continue;
      (by[t] ??= []).push({ name: `${p.first[0]}. ${p.last}`, ovr: toDisplay(ovrRaw(p.ratings), scale) });
    }
    const out: Record<number, { top: { name: string; ovr: number }[]; strength: number }> = {};
    for (const [k, list] of Object.entries(by)) {
      list.sort((a, b) => b.ovr - a.ovr);
      const top8 = list.slice(0, 8);
      out[+k] = { top: list.slice(0, 3), strength: top8.reduce((a, x) => a + x.ovr, 0) / Math.max(1, top8.length) };
    }
    return out;
  }, [seed, kind]);

  // where each roster stands before opening night (real rosters: a fictional league's are generated at the start)
  const rosterSize = useMemo(() => (seed && kind === 'real' ? seedRosterSizes(seed) : null), [seed, kind]);

  const rank = useMemo(() => {
    if (!teamInfo) return null;
    const ids = Object.keys(teamInfo)
      .map(Number)
      .sort((a, b) => teamInfo[b].strength - teamInfo[a].strength);
    return Object.fromEntries(ids.map((id, i) => [id, i + 1])) as Record<number, number>;
  }, [teamInfo]);

  const create = async (force = false) => {
    setBusy(true);
    // a league still open behind the main menu saves first: if it can't, say so rather than drop its changes
    const st = useStore.getState();
    if (!force && st.league && !(await st.saveBeforeLeaving())) {
      setBusy(false);
      setUnsaved(true);
      return;
    }
    await new Promise((r) => setTimeout(r, 30));
    try {
      const l = createLeague({ name: name.trim() || 'My League', userTid: tid!, coachName: coach.trim() || 'Coach', settings, seed: kind === 'real' ? seed : null });
      setLeague(l);
      // if it fails, play on: the save banner says so and offers a backup, and later saves retry
      await useStore.getState().save();
      nav('/');
    } catch (e) {
      console.error(e);
      useStore.getState().toast('Could not create the league. Please try again.', 'bad');
      setBusy(false);
    }
  };

  const f = tid !== null ? FRANCHISES[tid] : null;
  const stepNo = step === 'type' ? 1 : step === 'team' ? 2 : 3;
  return (
    <main className="page standalone st-page">
      <div className="ph">
        <button className="iconbtn back" onClick={back} aria-label="Back">
          <ChevronLeft size={24} />
        </button>
        <div className="grow">
          <h1>New League</h1>
          <div className="ph-sub">
            Step {stepNo} of 3 · {step === 'type' ? 'The league' : step === 'team' ? 'Your team' : 'You'}
          </div>
        </div>
      </div>
      <div className="nl-steps" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <span key={n} className={n <= stepNo ? 'on' : ''} />
        ))}
      </div>

      {step === 'type' && (
        <>
          <button type="button" className={`nl-choice ${kind === 'real' ? 'on' : ''}`} aria-pressed={kind === 'real'} disabled={!seed} onClick={() => setKind('real')}>
            <span className="nl-ic">
              <Database size={22} />
            </span>
            <span className="grow">
              <h3>Real 2026-27 NBA</h3>
              {seed && <span className="nl-body">{seed.players.length} real players and their contracts</span>}
              {!seedLoaded && (
                <span className="row small dim nl-note">
                  <Spinner /> Loading rosters…
                </span>
              )}
              {seedLoaded && !seed && (
                <span className="small warn nl-note">
                  {loadFailed
                    ? "The real rosters couldn't load. Check your connection and open New League again, or use a fictional league."
                    : 'This build has no real rosters yet. Use a fictional league.'}
                </span>
              )}
            </span>
            <span className="nl-check" aria-hidden="true">
              {kind === 'real' && <Check size={16} strokeWidth={3} />}
            </span>
          </button>
          <button type="button" className={`nl-choice ${kind === 'fictional' ? 'on' : ''}`} aria-pressed={kind === 'fictional'} onClick={() => setKind('fictional')}>
            <span className="nl-ic">
              <Shuffle size={22} />
            </span>
            <span className="grow">
              <h3>Fictional League</h3>
              <span className="nl-body">Real franchises, generated players</span>
            </span>
            <span className="nl-check" aria-hidden="true">
              {kind === 'fictional' && <Check size={16} strokeWidth={3} />}
            </span>
          </button>
          <More label="How the real ratings are made">
            <p className="small dim2" style={{ margin: 0 }}>
              Ratings come from three seasons of box scores (through 2025-26), NBA.com play-by-play and impact data, calibrated so every player reproduces his real numbers in the
              engine. Then Dunks & Threes&apos; 2026-27 EPM projection has the last word: how good each player is now, rookies included.
            </p>
          </More>
          <div className="nl-cta">
            <button className="btn primary big block" disabled={kind === 'real' && !seed} onClick={() => setStep('team')}>
              Choose your team
            </button>
          </div>
        </>
      )}

      {step === 'team' && (
        <>
          <Segmented
            value={conf}
            onChange={(c) => {
              setConf(c);
              // the team you're taking over is always one you can see in the grid
              if (tid !== null && FRANCHISES[tid].conf !== c) choose({ tid: '' });
            }}
            label="Conference"
            options={[
              { id: 'E', label: 'East' },
              { id: 'W', label: 'West' },
            ]}
          />
          {rank && <div className="tiny dim">Under each team: its roster&apos;s strength, ranked among the 30.</div>}
          <div className="nl-grid">
            {FRANCHISES.map((fr, i) => ({ fr, i }))
              .filter(({ fr }) => fr.conf === conf)
              .map(({ fr, i }) => (
                <button
                  key={fr.abbrev}
                  className={`nl-team ${tid === i ? 'on' : ''}`}
                  aria-pressed={tid === i}
                  style={tid === i ? slabVars(fr.colors) : undefined}
                  onClick={() => setTid(i)}
                >
                  <TeamLogo tid={i} size={42} decorative />
                  <span className="nl-team-name">{fr.name}</span>
                  <span className="nl-team-sub">{rank ? rankOf(rank[i], FRANCHISES.length) : `${market(fr.pop)} market`}</span>
                </button>
              ))}
          </div>
          {f && tid !== null && (
            <section className="slab nl-pick" style={slabVars(f.colors)} aria-label={`${f.region} ${f.name}`}>
              <span className="slab-mark">
                <TeamLogo tid={tid} size={170} decorative />
              </span>
              <span className="nl-pick-over">
                {f.div} · {market(f.pop)} market
              </span>
              <span className="nl-pick-name">
                <span className="nl-pick-region">{f.region}</span>
                {f.name}
              </span>
              <span className="nl-pick-sub">{kind === 'fictional' ? 'New players, generated at the start' : rosterSize?.[tid] ? rosterLine(rosterSize[tid]) : null}</span>
              {teamInfo?.[tid] && (
                <span className="nl-pick-top">
                  {teamInfo[tid].top.map((p) => (
                    <span key={p.name} className="row">
                      <Ovr v={p.ovr} size="sm" />
                      <span className="ellipsis">{p.name}</span>
                    </span>
                  ))}
                </span>
              )}
            </section>
          )}
          {/* in reach while the grid scrolls: the pick shows on the button */}
          <div className="nl-cta">
            <button className="btn primary big block" disabled={!f} onClick={() => setStep('setup')}>
              {f ? `Take over the ${f.name}` : 'Pick a team'}
            </button>
          </div>
        </>
      )}

      {step === 'setup' && f && tid !== null && (
        <>
          <div className="card row nl-chosen">
            <TeamLogo tid={tid} size={40} decorative />
            <div className="grow">
              <div className="lr-name">
                {f.region} {f.name}
              </div>
              <div className="lr-meta">{kind === 'real' ? 'Real 2026-27 NBA' : 'Fictional league'}</div>
            </div>
            <button className="btn sm" onClick={back}>
              Change
            </button>
          </div>
          <Section title="You">
            <div className="card flush nl-game">
              <label className="nl-field">
                <span className="nl-label">Coach</span>
                <input className="input" value={coach} placeholder="Your name" maxLength={40} onChange={(e) => setCoach(e.target.value)} />
              </label>
              <label className="nl-field">
                <span className="nl-label">League</span>
                <input className="input" value={name} maxLength={50} onChange={(e) => setName(e.target.value)} />
              </label>
            </div>
          </Section>
          <Section title="Gameplay">
            <div className="card flush nl-game">
              <DifficultyPicker value={settings.difficulty} onChange={(d) => setSettings({ ...settings, difficulty: d })} />
              <Toggle on={settings.injuries} onChange={(v) => setSettings({ ...settings, injuries: v })} label="Injuries" help="Fatigue, age and history raise the risk." />
              <Toggle
                on={settings.jobSecurity}
                onChange={(v) => setSettings({ ...settings, jobSecurity: v })}
                label="Job security"
                help="After his grace period (Difficulty sets how long), the owner can fire you for a season short of his goals."
              />
              <Toggle
                on={settings.teaching !== false}
                onChange={(v) => {
                  setSettings({ ...settings, teaching: v });
                  rememberTeaching(v);
                }}
                label="Teaching"
                help={TEACHING_HELP}
              />
            </div>
          </Section>
          {/* a reload on this step starts over as a real league: wait for its rosters rather than silently make a fictional one */}
          <div className="nl-cta">
            {kind === 'real' && seedLoaded && !seed && (
              <div className="small warn">The real rosters couldn't load. Check your connection and open New League again, or go back and pick a fictional league.</div>
            )}
            <button className="btn primary big block" disabled={busy || (kind === 'real' && !seed)} onClick={() => void create()}>
              {busy ? <Spinner /> : null} {busy ? 'Building the league…' : 'Start career'}
            </button>
          </div>
        </>
      )}
      <UnsavedSheet
        open={unsaved}
        title="Create without saving?"
        proceed="Create anyway"
        onStay={() => setUnsaved(false)}
        onProceed={() => {
          setUnsaved(false);
          void create(true);
        }}
      />
    </main>
  );
}
