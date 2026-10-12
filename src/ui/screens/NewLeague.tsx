import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Database, Shuffle } from 'lucide-react';
import { FRANCHISES, BBREF_TO_TID } from '../../core/teams';
import { TeamLogo } from '../components/TeamLogo';
import { Card, Chips, Ovr, Segmented, Spinner, Toggle } from '../components/ui';
import { loadSeed } from '../../data/seedLoader';
import type { SeedData } from '../../core/league/create';
import { createLeague, defaultSettings } from '../../core/league/create';
import { buildOvrScale, ovrRaw, toDisplay } from '../../core/ratings';
import { useStore } from '../../state/store';
import type { Settings } from '../../core/types';
import { UnsavedSheet } from '../components/UnsavedSheet';
import { canGoBack } from '../nav';
import { COMPLEXITY, DIFFICULTY, helpFor } from '../settingsOptions';

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
  const back = () => {
    if (step === 'type') nav('/start');
    else if (canGoBack()) nav(-1);
    else setStep(step === 'setup' ? 'team' : 'type');
  };
  const [conf, setConf] = useState<'E' | 'W'>(() => (tid !== null ? FRANCHISES[tid].conf : 'E'));
  const [name, setName] = useState('My League');
  const [coach, setCoach] = useState('');
  const [settings, setSettings] = useState<Settings>(defaultSettings());
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
  return (
    <main className="page standalone" style={{ paddingBottom: 40 }}>
      <div className="row">
        <button className="iconbtn" onClick={back} aria-label="Back">
          <ChevronLeft size={22} />
        </button>
        <h1 style={{ textTransform: 'uppercase', fontSize: 26 }}>New League</h1>
        <div className="grow" />
        <span className="small dim">Step {step === 'type' ? 1 : step === 'team' ? 2 : 3} of 3</span>
      </div>

      {step === 'type' && (
        <>
          <button
            type="button"
            className={`card clickable ${kind === 'real' ? 'accent' : ''}`}
            style={{ width: '100%', textAlign: 'left' }}
            aria-pressed={kind === 'real'}
            disabled={!seed}
            onClick={() => setKind('real')}
          >
            <div className="row top">
              <Database size={28} />
              <div className="grow">
                <h3>Real 2026-27 NBA</h3>
                <div className="dim2 small" style={{ marginTop: 4 }}>
                  Opening-night rosters and contracts. Ratings come from three seasons of box scores, NBA.com play-by-play and impact data, then are calibrated so every player
                  reproduces his real numbers in the engine.
                </div>
                {!seedLoaded && (
                  <div className="row small dim" style={{ marginTop: 8 }}>
                    <Spinner /> Loading rosters…
                  </div>
                )}
                {seedLoaded && !seed && (
                  <div className="small warn" style={{ marginTop: 8 }}>
                    {loadFailed
                      ? "The real rosters couldn't load. Check your connection and open New League again, or use a fictional league."
                      : 'Seed data is not bundled in this build yet. Use a fictional league for now.'}
                  </div>
                )}
                {seed && (
                  <div className="small dim" style={{ marginTop: 8 }}>
                    {seed.players.length} players · 30 teams · stats through 2025-26
                  </div>
                )}
              </div>
            </div>
          </button>
          <button
            type="button"
            className={`card clickable ${kind === 'fictional' ? 'accent' : ''}`}
            style={{ width: '100%', textAlign: 'left' }}
            aria-pressed={kind === 'fictional'}
            onClick={() => setKind('fictional')}
          >
            <div className="row top">
              <Shuffle size={28} />
              <div className="grow">
                <h3>Fictional League</h3>
                <div className="dim2 small" style={{ marginTop: 4 }}>
                  Real franchises, randomly generated players. Every save is different.
                </div>
              </div>
            </div>
          </button>
          <button className="btn primary big block" disabled={kind === 'real' && !seed} onClick={() => setStep('team')}>
            Choose your team
          </button>
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
          <div className="grid3">
            {FRANCHISES.map((fr, i) => ({ fr, i }))
              .filter(({ fr }) => fr.conf === conf)
              .map(({ fr, i }) => (
                <button
                  key={fr.abbrev}
                  className="card tight"
                  aria-pressed={tid === i}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    borderColor: tid === i ? 'var(--accent)' : undefined,
                    background: tid === i ? `linear-gradient(160deg, ${fr.colors[0]}55, var(--surface))` : undefined,
                  }}
                  onClick={() => setTid(i)}
                >
                  <TeamLogo tid={i} size={44} decorative />
                  <div className="bold small">{fr.name}</div>
                  <div className="tiny dim">{rank ? `Power #${rank[i]}` : `${market(fr.pop)} market`}</div>
                </button>
              ))}
          </div>
          {f && tid !== null && (
            <Card title={`${f.region} ${f.name}`} right={<TeamLogo tid={tid} size={32} decorative />}>
              <div className="small dim2">
                {f.arena} · Market: {market(f.pop)} ({f.pop}M) · {f.div} Division
              </div>
              {kind === 'fictional' && (
                <div className="small dim" style={{ marginTop: 8 }}>
                  Rosters are generated when the league is created, so every player here will be new.
                </div>
              )}
              {teamInfo?.[tid] && (
                <div className="col" style={{ marginTop: 10, gap: 6 }}>
                  {teamInfo[tid].top.map((p) => (
                    <div key={p.name} className="row">
                      <Ovr v={p.ovr} size="sm" />
                      <span>{p.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
          <button className="btn primary big block" disabled={!f} onClick={() => setStep('setup')}>
            {f ? `Take over the ${f.name}` : 'Pick a team'}
          </button>
        </>
      )}

      {step === 'setup' && f && tid !== null && (
        <>
          <Card>
            <div className="row">
              <TeamLogo tid={tid} size={40} decorative />
              <div className="grow">
                <div className="bold">
                  {f.region} {f.name}
                </div>
                <div className="small dim">{kind === 'real' ? 'Real 2026-27 NBA' : 'Fictional league'}</div>
              </div>
              <button className="btn sm" onClick={back}>
                Change
              </button>
            </div>
          </Card>
          <Card title="You">
            <div className="col" style={{ gap: 10 }}>
              <label className="col" style={{ gap: 4 }}>
                <span className="small dim">Coach / GM name</span>
                <input className="input" value={coach} placeholder="Your name" maxLength={40} onChange={(e) => setCoach(e.target.value)} />
              </label>
              <label className="col" style={{ gap: 4 }}>
                <span className="small dim">League name</span>
                <input className="input" value={name} maxLength={50} onChange={(e) => setName(e.target.value)} />
              </label>
            </div>
          </Card>
          <Card title="Difficulty">
            <Chips label="Difficulty" value={settings.difficulty} onChange={(d) => setSettings({ ...settings, difficulty: d })} options={DIFFICULTY} />
            <div className="small dim" style={{ marginTop: 8 }}>
              {helpFor(DIFFICULTY, settings.difficulty)} You can change this any time.
            </div>
          </Card>
          <Card title="Coaching depth">
            <Chips label="Coaching depth" value={settings.complexity} onChange={(c) => setSettings({ ...settings, complexity: c })} options={COMPLEXITY} />
            <div className="small dim" style={{ marginTop: 8 }}>
              {helpFor(COMPLEXITY, settings.complexity)} You can change this any time.
            </div>
          </Card>
          <Card>
            <div className="col" style={{ gap: 14 }}>
              <Toggle
                on={settings.injuries}
                onChange={(v) => setSettings({ ...settings, injuries: v })}
                label="Injuries"
                help="Players can get hurt; fatigue, age and injury history raise the risk."
              />
              <Toggle
                on={settings.jobSecurity}
                onChange={(v) => setSettings({ ...settings, jobSecurity: v })}
                label="Job security"
                help="The owner can fire you after repeated bad seasons."
              />
            </div>
          </Card>
          {/* a reload on this step starts over as a real league: wait for its rosters rather than silently make a fictional one */}
          <button className="btn primary big block" disabled={busy || (kind === 'real' && !seed)} onClick={() => void create()}>
            {busy ? <Spinner /> : null} Start career
          </button>
          {kind === 'real' && seedLoaded && !seed && (
            <div className="small warn">The real rosters couldn't load. Check your connection and open New League again, or go back and pick a fictional league.</div>
          )}
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
