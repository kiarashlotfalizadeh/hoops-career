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
import { canGoBack } from '../nav';

type Step = 'type' | 'team' | 'setup';

const market = (pop: number) => (pop >= 9 ? 'Huge' : pop >= 5 ? 'Large' : pop >= 2.5 ? 'Mid-size' : 'Small');

export default function NewLeague() {
  const nav = useNavigate();
  const setLeague = useStore((s) => s.setLeague);
  const [seed, setSeed] = useState<SeedData | null>(null);
  const [seedLoaded, setSeedLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [kind, setKind] = useState<'real' | 'fictional'>('real');
  // steps live in the URL so the system Back button walks back through them
  const [sp, setSp] = useSearchParams();
  const step: Step = sp.get('step') === 'team' || sp.get('step') === 'setup' ? (sp.get('step') as Step) : 'type';
  const setStep = (st: Step) => setSp(st === 'type' ? {} : { step: st });
  const back = () => {
    if (step === 'type') nav('/start');
    else if (canGoBack()) nav(-1);
    else setStep(step === 'setup' ? 'team' : 'type');
  };
  const [tid, setTid] = useState<number>(19);
  const [conf, setConf] = useState<'E' | 'W'>('E');
  const [name, setName] = useState('My League');
  const [coach, setCoach] = useState('');
  const [settings, setSettings] = useState<Settings>(defaultSettings());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadSeed()
      .then((s) => {
        setSeed(s.players.length ? s : null);
        if (!s.players.length) setKind('fictional');
      })
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

  const create = async () => {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 30));
    try {
      const l = createLeague({ name: name.trim() || 'My League', userTid: tid, coachName: coach.trim() || 'Coach', settings, seed: kind === 'real' ? seed : null });
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

  const f = FRANCHISES[tid];
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
            onChange={setConf}
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
                  <TeamLogo tid={i} size={44} />
                  <div className="bold small">{fr.name}</div>
                  <div className="tiny dim">{rank ? `Power #${rank[i]}` : `${market(fr.pop)} market`}</div>
                </button>
              ))}
          </div>
          <Card title={`${f.region} ${f.name}`} right={<TeamLogo tid={tid} size={32} />}>
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
          <button className="btn primary big block" onClick={() => setStep('setup')}>
            Take over the {f.name}
          </button>
        </>
      )}

      {step === 'setup' && (
        <>
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
            <Chips
              value={settings.difficulty}
              onChange={(d) => setSettings({ ...settings, difficulty: d })}
              options={[
                { id: 'casual', label: 'Casual' },
                { id: 'normal', label: 'Normal' },
                { id: 'hard', label: 'Hard' },
              ]}
            />
            <div className="small dim" style={{ marginTop: 8 }}>
              {/* the same numbers Settings quotes */}
              {settings.difficulty === 'casual'
                ? 'AI GMs accept trades about 12% below fair value, and free agents ask you for 10% less.'
                : settings.difficulty === 'hard'
                  ? 'AI GMs want a 12% premium in trades, and free agents ask you for 12% more.'
                  : 'Fair trades and market-rate contracts.'}{' '}
              You can change this any time.
            </div>
          </Card>
          <Card title="Coaching depth">
            <Chips
              value={settings.complexity}
              onChange={(c) => setSettings({ ...settings, complexity: c })}
              options={[
                { id: 'simple', label: 'Simple' },
                { id: 'advanced', label: 'Advanced' },
                { id: 'expert', label: 'Expert' },
              ]}
            />
            <div className="small dim" style={{ marginTop: 8 }}>
              {settings.complexity === 'simple'
                ? 'Pick a playbook and a defensive identity. The staff handles the details.'
                : settings.complexity === 'advanced'
                  ? 'Tune pace, shot profile, actions, coverages and help. Recommended.'
                  : 'Everything: individual roles, shot freedom, matchups, end-of-game rules.'}{' '}
              You can change this any time.
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
    </main>
  );
}
