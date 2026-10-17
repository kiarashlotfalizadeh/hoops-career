// God mode's hub (/god): the switch, and the editor's ways in: any player (or a new one), any team,
// forced trades and the owner. The player and team pages and the Trade screen have their own Edit
// and Force while it's on; the top bar's wand comes here.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftRight, Pencil, TriangleAlert, UserPlus } from 'lucide-react';
import { setOwnerConfidence } from '../../core/league/godMode';
import { useLeague, useStore } from '../../state/store';
import { Card, PageHeader, Slider, Toggle } from '../components/ui';
import { TeamLogo } from '../components/TeamLogo';
import { PlayerPicker } from '../components/PlayerPicker';
import { Callout, SecTitle } from '../office/common';
import { PlayerEditor } from '../god/PlayerEditor';
import { TeamEditor } from '../god/TeamEditor';
import { CreatePlayer } from '../god/CreatePlayer';
import { applyEdit, useEditBlock } from '../god/common';

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
      <Card>
        <Toggle
          on={on}
          onChange={(v) => useStore.getState().mutate((l) => (l.settings.godMode = v))}
          label="God mode"
          help="Edit any player or team, create players and force trades. Turn it off at any time: your edits stay, and the editor is out of the way until you turn it back on."
        />
        <div className="tiny dim" style={{ marginTop: 8 }}>
          {edits ? `${edits} edit${edits === 1 ? '' : 's'} made in this league.` : 'No edits made in this league yet.'}
        </div>
      </Card>

      {on && (
        <>
          {block && (
            <Callout tone="warn" icon={<TriangleAlert size={18} className="warn" />}>
              {block}
            </Callout>
          )}
          <SecTitle>Players</SecTitle>
          <Card>
            <div className="grid2">
              <button className="btn" aria-haspopup="dialog" onClick={() => setPicking(true)}>
                <Pencil size={17} /> Edit a player
              </button>
              <button className="btn" aria-haspopup="dialog" onClick={() => setCreating(true)}>
                {/* (as short as Edit's: on a narrow phone "Create a player" took two lines beside its one) */}
                <UserPlus size={17} /> New player
              </button>
            </div>
            <div className="small dim" style={{ marginTop: 8 }}>
              Ratings, potential, bio, injuries, mood, contract and team. Every player's page has Edit too.
            </div>
          </Card>

          <SecTitle>Teams</SecTitle>
          <Card>
            <div className="fo-teamgrid">
              {teams.map((t) => (
                <button
                  key={t.tid}
                  className="card tight"
                  aria-haspopup="dialog"
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingInline: 4 }}
                  onClick={() => setTeam(t.tid)}
                >
                  <TeamLogo tid={t.tid} size={36} decorative />
                  <span className="small bold god-tile-name">{t.name}</span>
                  <span className="sr-only">: edit the {t.region} team</span>
                </button>
              ))}
            </div>
          </Card>

          <SecTitle>Trades</SecTitle>
          <Card>
            <div className="row" style={{ gap: 12 }}>
              <div className="grow small dim2">The Trade screen gets Force: your deal with another team goes through whatever its GM, the cap or the calendar say.</div>
              <Link to="/trade" className="btn sm">
                <ArrowLeftRight size={16} /> Trade
              </Link>
            </div>
          </Card>

          <SecTitle>Owner</SecTitle>
          <Card>
            <div className="col" style={{ gap: 10 }}>
              <Slider
                label="Owner's confidence in you"
                min={-100}
                max={100}
                value={Math.round(owner * 100)}
                onChange={(v) => setDraft(v / 100)}
                format={(v) => `${v > 0 ? '+' : ''}${v}`}
                left="Ready to fire you"
                right="Delighted"
                help="With Job security on, below -50 after your first two seasons in charge a bad season gets you fired."
              />
              <button className="btn sm" style={{ alignSelf: 'flex-start' }} disabled={!!block || owner === league.ownerMood.total} onClick={saveOwner}>
                Save
              </button>
            </div>
          </Card>
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
