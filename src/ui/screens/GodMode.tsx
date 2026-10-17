// God mode's hub (/god): the switch, and the editor's ways in: any player (or a new one), any team,
// forced trades and the owner. The player and team pages and the Trade screen have their own Edit
// and Force while it's on; the top bar's wand comes here.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftRight, Pencil, TriangleAlert, UserPlus } from 'lucide-react';
import { setOwnerConfidence } from '../../core/league/godMode';
import { useLeague, useStore } from '../../state/store';
import { PageHeader, Section, Slider, Toggle } from '../components/ui';
import { TeamLogo } from '../components/TeamLogo';
import { PlayerPicker } from '../components/PlayerPicker';
import { PlayerEditor } from '../god/PlayerEditor';
import { TeamEditor } from '../god/TeamEditor';
import { CreatePlayer } from '../god/CreatePlayer';
import { applyEdit, useEditBlock } from '../god/common';
import '../god/god.css';

export default function GodMode() {
  const league = useLeague();
  const on = !!league.settings.godMode;
  const block = useEditBlock(league);
  const [picking, setPicking] = useState(false);
  const [player, setPlayer] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [team, setTeam] = useState<number | null>(null);
  // the slider shows the owner's mood as it is (a sim moves it) until it's dragged
  const [draft, setDraft] = useState<number | null>(null);
  const owner = draft ?? league.ownerMood.total;
  const edits = league.godEdits ?? 0;
  const teams = [...league.teams].sort((a, b) => a.region.localeCompare(b.region) || a.name.localeCompare(b.name));
  const saveOwner = () => {
    if (!applyEdit((l) => setOwnerConfidence(l, owner))) return;
    setDraft(null);
    useStore.getState().toast("The owner's confidence is set.", 'good');
  };
  return (
    <main className="page">
      <PageHeader title="God mode" sub="The in-game editor" back backTo="/settings" />
      <div className={`card god-switch ${on ? 'on' : ''}`}>
        <Toggle
          on={on}
          onChange={(v) => useStore.getState().mutate((l) => (l.settings.godMode = v))}
          label="God mode"
          help="Edit any player or team, create players and force trades. Your edits stay when it's off."
        />
        <div className="tiny dim">{edits ? `${edits} edit${edits === 1 ? '' : 's'} in this league` : 'No edits in this league yet'}</div>
      </div>

      {on && (
        <>
          {block && (
            <div className="card row top god-block" role="status">
              <TriangleAlert size={18} className="warn" />
              <div className="grow small">{block}</div>
            </div>
          )}
          <Section title="Players">
            <div className="grid2">
              <button className="btn" aria-haspopup="dialog" onClick={() => setPicking(true)}>
                <Pencil size={17} /> Edit a player
              </button>
              <button className="btn" aria-haspopup="dialog" onClick={() => setCreating(true)}>
                {/* (as short as Edit's: on a narrow phone "Create a player" took two lines beside its one) */}
                <UserPlus size={17} /> New player
              </button>
            </div>
            <div className="small dim">Ratings, bio, health, mood, contract and team. Every player's page has Edit too.</div>
          </Section>

          <Section title="Teams">
            <div className="god-teams">
              {teams.map((t) => (
                <button key={t.tid} className="god-team" aria-haspopup="dialog" onClick={() => setTeam(t.tid)}>
                  <TeamLogo tid={t.tid} size={34} decorative />
                  <span className="god-team-ab">{t.abbrev}</span>
                  <span className="sr-only">
                    : edit the {t.region} {t.name}
                  </span>
                </button>
              ))}
            </div>
          </Section>

          <Section title="Trades">
            <div className="card row" style={{ gap: 12 }}>
              <div className="grow small dim2">Force puts your deal through whatever the other GM, the cap or the calendar say.</div>
              <Link to="/trade" className="btn sm">
                <ArrowLeftRight size={16} /> Trade
              </Link>
            </div>
          </Section>

          <Section title="Owner">
            <div className="card col" style={{ gap: 10 }}>
              <Slider
                label="Owner's confidence in you"
                min={-100}
                max={100}
                value={Math.round(owner * 100)}
                onChange={(v) => setDraft(v / 100)}
                format={(v) => `${v > 0 ? '+' : ''}${v}`}
                left="Ready to fire you"
                right="Delighted"
                help="With Job security on, under -50 after your first two seasons a bad season gets you fired."
              />
              <button className="btn sm" style={{ alignSelf: 'flex-start' }} disabled={!!block || owner === league.ownerMood.total} onClick={saveOwner}>
                Save
              </button>
            </div>
          </Section>
        </>
      )}

      <PlayerPicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(pid) => {
          setPicking(false);
          setPlayer(pid);
        }}
        title="Edit a player"
      />
      <PlayerEditor pid={player} onClose={() => setPlayer(null)} />
      <CreatePlayer open={creating} onClose={() => setCreating(false)} />
      <TeamEditor tid={team} onClose={() => setTeam(null)} />
    </main>
  );
}
