import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Database, Shuffle } from 'lucide-react';
import { FRANCHISES, BBREF_TO_TID } from '../../core/teams';
import { TeamLogo } from '../components/TeamLogo';
import { Card, Chips, Ovr, Segmented, Spinner, Toggle } from '../components/ui';
import { loadSeed } from '../../data/seedLoader';
import type { SeedData } from '../../core/league/create';
import { createLeague, defaultSettings } from '../../core/league/create';
import { buildOvrScale, ovrRaw, toDisplay } from '../../core/ratings';
import { useStore } from '../../state/store';
import { saveLeague } from '../../state/persistence';
import type { Settings } from '../../core/types';

type Step = 'type' | 'team' | 'setup';

export default function NewLeague() {
  const nav = useNavigate();
  const setLeague = useStore((s) => s.setLeague);
  const [seed, setSeed] = useState<SeedData | null>(null);
  const [seedLoaded, setSeedLoaded] = useState(false);
  const [kind, setKind] = useState<'real' | 'fictional'>('real');
  const [step, setStep] = useState<Step>('type');
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
      .catch(() => setKind('fictional'))
      .finally(() => setSeedLoaded(true));
  }, []);

  const teamInfo = useMemo(() => {
    if (!seed) return null;
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
  }, [seed]);

  const rank = useMemo(() => {
    if (!teamInfo) return null;
    const ids = Object.keys(teamInfo).map(Number).sort((a, b) => teamInfo[b].strength - teamInfo[a].strength);
    return Object.fromEntries(ids.map((id, i) => [id, i + 1])) as Record<number, number>;
  }, [teamInfo]);

  const create = async () => {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 30));
    const l = createLeague({ name: name || 'My League', userTid: tid, coachName: coach || 'Coach', settings, seed: kind === 'real' ? seed : null });
    await saveLeague(l);
    setLeague(l);
    nav('/');
  };

  const f = FRANCHISES[tid];
  return (
    <main className="page" style={{ paddingBottom: 40 }}>
      <div className="row">
        <button className="iconbtn" onClick={() => (step === 'type' ? nav('/start') : setStep(step === 'setup' ? 'team' : 'type'))} aria-label="Back">
          <ChevronLeft size={22} />
        </button>
        <h1 style={{ textTransform: 'uppercase', fontSize: 26 }}>New League</h1>
        <div className="grow" />
        <span className="small dim">Step {step === 'type' ? 1 : step === 'team' ? 2 : 3} of 3</span>
      </div>

      {step === 'type' && (
        <>
          <Card accent={kind === 'real'} onClick={() => seed && setKind('real')}>
            <div className="row top">
              <Database size={28} />
              <div className="grow">
                <h3>Real 2026-27 NBA</h3>
                <div className="dim2 small" style={{ marginTop: 4 }}>
                  Every team as signed on Basketball Reference's contracts page. Ratings derived from 2023-24 to 2025-26 per-game and advanced stats, then calibrated so players reproduce their real numbers in the engine.
                </div>
                {!seedLoaded && <div className="row small dim" style={{ marginTop: 8 }}><Spinner /> Loading rosters…</div>}
                {seedLoaded && !seed && <div className="small warn" style={{ marginTop: 8 }}>Seed data is not bundled in this build yet. Use a fictional league for now.</div>}
                {seed && <div className="small dim" style={{ marginTop: 8 }}>{seed.players.length} players · {seed.source}</div>}
              </div>
            </div>
          </Card>
          <Card accent={kind === 'fictional'} onClick={() => setKind('fictional')}>
            <div className="row top">
              <Shuffle size={28} />
              <div className="grow">
                <h3>Fictional League</h3>
                <div className="dim2 small" style={{ marginTop: 4 }}>
                  Real franchises, randomly generated players. Every save is different.
                </div>
              </div>
            </div>
          </Card>
          <button className="btn primary big block" disabled={kind === 'real' && !seed} onClick={() => setStep('team')}>
            Choose your team
          </button>
        </>
      )}

      {step === 'team' && (
        <>
          <Segmented value={conf} onChange={setConf} options={[{ id: 'E', label: 'East' }, { id: 'W', label: 'West' }]} />
          <div className="grid3">
            {FRANCHISES.map((fr, i) => ({ fr, i }))
              .filter(({ fr }) => fr.conf === conf)
              .map(({ fr, i }) => (
                <button
                  key={fr.abbrev}
                  className="card tight"
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, borderColor: tid === i ? 'var(--accent)' : undefined, background: tid === i ? `linear-gradient(160deg, ${fr.colors[0]}55, var(--surface))` : undefined }}
                  onClick={() => setTid(i)}
                >
                  <TeamLogo tid={i} size={44} />
                  <div className="bold small">{fr.name}</div>
                  {rank && <div className="tiny dim">Power #{rank[i]}</div>}
                </button>
              ))}
          </div>
          <Card title={`${f.region} ${f.name}`} right={<TeamLogo tid={tid} size={32} />}>
            <div className="small dim2">
              {f.arena} · Market: {f.pop >= 9 ? 'Huge' : f.pop >= 5 ? 'Large' : f.pop >= 2.5 ? 'Mid-size' : 'Small'} ({f.pop}M) · {f.div} Division
            </div>
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
                <input className="input" value={coach} placeholder="Your name" onChange={(e) => setCoach(e.target.value)} />
              </label>
              <label className="col" style={{ gap: 4 }}>
                <span className="small dim">League name</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
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
              {settings.difficulty === 'casual' ? 'AI GMs are forgiving in trades and free agents ask for a bit less.' : settings.difficulty === 'hard' ? 'AI GMs want a premium and players ask for more money.' : 'Fair trades, market-rate contracts.'}
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
              <Toggle on={settings.injuries} onChange={(v) => setSettings({ ...settings, injuries: v })} label="Injuries" help="Players can get hurt; fatigue and age raise the risk." />
              <Toggle on={settings.jobSecurity} onChange={(v) => setSettings({ ...settings, jobSecurity: v })} label="Job security" help="The owner can fire you after repeated bad seasons." />
            </div>
          </Card>
          <button className="btn primary big block" disabled={busy} onClick={() => void create()}>
            {busy ? <Spinner /> : null} Start career
          </button>
        </>
      )}
    </main>
  );
}
