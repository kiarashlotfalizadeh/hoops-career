// God mode's hub (/god): the switch, and the editor's ways in as one list: any player (or a new
// one), any team (from a sheet of the league's teams), forced trades, and the owner. The player and team pages and the Trade screen have their own Edit
// and Force while it's on; the top bar's wand comes here.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftRight, ChevronRight, Pencil, Shield, TriangleAlert, UserPlus } from 'lucide-react';
import { setOwnerConfidence } from '../../core/league/godMode';
import { edit } from '../../state/actions';
import { useLeague, useStore } from '../../state/store';
import { Help, PageHeader, Section, Sheet, Slider, Toggle } from '../components/ui';
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
  const [teamsOpen, setTeamsOpen] = useState(false);
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
          onChange={(v) => edit((l) => void (l.settings.godMode = v))}
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
          {/* the editor's ways in, as one list: the teams in a sheet of their own */}
          <Section title="Edit">
            <div className="card flush list god-ways">
              <button className="listrow clickable god-way" aria-haspopup="dialog" onClick={() => setPicking(true)}>
                <Pencil size={18} aria-hidden="true" />
                <span className="grow lr-name">Edit a player</span>
                <ChevronRight size={18} className="dim" aria-hidden="true" />
              </button>
              <button className="listrow clickable god-way" aria-haspopup="dialog" onClick={() => setCreating(true)}>
                <UserPlus size={18} aria-hidden="true" />
                <span className="grow lr-name">New player</span>
                <ChevronRight size={18} className="dim" aria-hidden="true" />
              </button>
              <button className="listrow clickable god-way" aria-haspopup="dialog" onClick={() => setTeamsOpen(true)}>
                <Shield size={18} aria-hidden="true" />
                <span className="grow lr-name">Edit a team</span>
                <ChevronRight size={18} className="dim" aria-hidden="true" />
              </button>
              <Link to="/office/trade" className="listrow clickable god-way">
                <ArrowLeftRight size={18} aria-hidden="true" />
                <span className="grow">
                  <span className="lr-name">Force a trade</span>
                  <span className="lr-meta">Past their GM, the cap and the calendar</span>
                </span>
                <ChevronRight size={18} className="dim" aria-hidden="true" />
              </Link>
            </div>
          </Section>

          <Section title="Owner">
            <div className="card col god-owner">
              <Slider
                label={
                  <span className="row" style={{ gap: 6 }}>
                    Owner's confidence in you
                    <Help title="Owner's confidence">
                      Your standing with him, −100 to +100: Office → Owner&apos;s job-security meter reads it out of 100 (50 + half of it). With job security on, a review under −50
                      fires you once his grace period is over (Difficulty sets how long).
                    </Help>
                  </span>
                }
                name="Owner's confidence in you"
                min={-100}
                max={100}
                value={Math.round(owner * 100)}
                onChange={(v) => setDraft(v / 100)}
                format={(v) => `${v > 0 ? '+' : ''}${v}`}
                left="Ready to fire you"
                right="Delighted"
              />
              <button className="btn sm god-save" disabled={!!block || owner === league.ownerMood.total} onClick={saveOwner}>
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
      <Sheet open={teamsOpen} onClose={() => setTeamsOpen(false)} title="Edit a team">
        <div className="card flush">
          <div className="list">
            {teams.map((t) => (
              <button
                key={t.tid}
                className="listrow clickable god-way"
                aria-haspopup="dialog"
                onClick={() => {
                  setTeamsOpen(false);
                  setTeam(t.tid);
                }}
              >
                <TeamLogo tid={t.tid} size={30} decorative />
                <span className="grow lr-name">
                  {t.region} {t.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      </Sheet>
      <TeamEditor tid={team} onClose={() => setTeam(null)} />
    </main>
  );
}
