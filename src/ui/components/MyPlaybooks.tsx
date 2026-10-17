// The coach's saved playbooks on the Tactics screen: the "My playbooks" card (load, compare in the
// Lab, overwrite, rename, delete, save the current tactics as a new one) and the header line that
// names the playbook the tactics came from, with "· edited" once they have moved from it.
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, FlaskConical, Save } from 'lucide-react';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import {
  MAX_PLAYBOOKS,
  PLAYBOOK_NAME_MAX,
  applyPlaybook,
  changeText,
  deletePlaybook,
  loadPlaybook,
  overwritePlaybook,
  playbookDiff,
  playbookLabel,
  playbookLibrary,
  playbookNameError,
  playbookStatus,
  renamePlaybook,
  savePlaybook,
  type TacticsChange,
} from '../../core/sim/playbooks';
import { fmtDate, rosterSorted } from '../../core/league/helpers';
import type { League, SavedPlaybook } from '../../core/types';
import { rosterNames } from '../stats';
import { setLabBaseline } from '../screens/labBridge';
import { Card, Help, Sheet, Tag, activateOnKey } from './ui';

/** The user's roster and how its players are named in the changes lists. */
function useRoster(league: League) {
  const players = useLeagueMemo(() => rosterSorted(league, league.userTid), [league]);
  return useMemo(() => ({ pids: players.map((p) => p.pid), name: rosterNames(players, { initial: true }) }), [players]);
}

/** The playbook the coach's tactics came from, and whether they have moved since (null: none, or the assistant runs them). */
function useCurrent(league: League) {
  const { name } = useRoster(league);
  const manual = league.teams[league.userTid].tactics.manual;
  return useLeagueMemo(() => (manual ? playbookStatus(league, name) : null), [league, name, manual]);
}

/** "Playbook: Opening night · edited", for the Tactics header. */
export function PlaybookLine() {
  const league = useLeague();
  const cur = useCurrent(league);
  if (!cur) return null;
  return (
    <div className="ellipsis" style={{ color: 'var(--text-2)', fontWeight: 650 }}>
      Playbook: {cur.pb.name}
      {cur.changes.length > 0 && ' · edited'}
    </div>
  );
}

function Changes({ list, max = 8 }: { list: TacticsChange[]; max?: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? list : list.slice(0, max);
  return (
    <div className="col" style={{ gap: 4 }}>
      {shown.map((c) => (
        <div key={changeText(c)} className="small">
          <span className="bold">{c.label}</span>{' '}
          {c.from || c.to ? (
            <span className="dim2">
              {c.from} → <span style={{ color: 'var(--accent-text)' }}>{c.to}</span>
            </span>
          ) : (
            <span className="dim2">changes</span>
          )}
        </div>
      ))}
      {list.length > shown.length && (
        <button className="btn xs ghost" style={{ alignSelf: 'flex-start', marginTop: 4 }} onClick={() => setAll(true)}>
          {list.length - shown.length} more
        </button>
      )}
    </div>
  );
}

function NameForm({ initial, submit, label, onCancel }: { initial: string; submit: (name: string) => string | null; label: string; onCancel?: () => void }) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(submit(name));
  };
  return (
    <form className="col" style={{ gap: 8 }} onSubmit={onSubmit}>
      <input
        className="input"
        value={name}
        maxLength={PLAYBOOK_NAME_MAX}
        placeholder="e.g. Small ball"
        aria-label="Playbook name"
        aria-invalid={!!error}
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
      />
      {error && (
        <div className="small" role="alert" style={{ color: 'var(--bad)' }}>
          {error}
        </div>
      )}
      <div className="row" style={{ gap: 8 }}>
        {onCancel && (
          <button type="button" className="btn grow" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn primary grow">
          {label}
        </button>
      </div>
    </form>
  );
}

type Step = 'view' | 'rename' | 'overwrite' | 'delete';

function PlaybookSheet({ pb, close }: { pb: SavedPlaybook; close: () => void }) {
  const league = useLeague();
  const nav = useNavigate();
  const t = league.teams[league.userTid].tactics;
  const roster = useRoster(league);
  const [step, setStep] = useState<Step>('view');
  // what loading it would change, and (for overwriting) what the playbook would take from the tactics
  const diff = useLeagueMemo(() => playbookDiff(t, pb, roster.pids, roster.name), [t, pb, roster]);
  const inUse = t.manual && t.playbook?.id === pb.id;
  const mutate = useStore.getState().mutate;
  const toast = useStore.getState().toast;
  const load = () => {
    mutate((l) => void applyPlaybook(l, pb.id));
    toast(`Loaded "${pb.name}"`, 'good');
    close();
  };
  const compare = () => {
    // the playbook as it would load now is the before side; the current tactics are the after
    setLabBaseline(loadPlaybook(t, pb, roster.pids), league, pb.name);
    close();
    nav('/lab?compare=1');
  };
  if (step === 'rename')
    return (
      <NameForm
        initial={pb.name}
        label="Rename"
        onCancel={() => setStep('view')}
        submit={(name) => {
          // (checked first, so a name that can't be used changes nothing)
          const err = playbookNameError(league, name, pb.id);
          if (err) return err;
          mutate((l) => void renamePlaybook(l, pb.id, name));
          setStep('view');
          return null;
        }}
      />
    );
  if (step === 'overwrite' || step === 'delete')
    return (
      <div className="col" style={{ gap: 12 }}>
        <div className="small">
          {step === 'overwrite'
            ? `Replace "${pb.name}" with your current tactics? ${diff.length ? `${diff.length} ${diff.length === 1 ? 'setting changes' : 'settings change'} in it.` : 'They are the same now.'}`
            : `Delete "${pb.name}"? Your tactics keep their settings.`}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn grow" onClick={() => setStep('view')}>
            Cancel
          </button>
          <button
            className={`btn grow ${step === 'delete' ? 'danger' : 'primary'}`}
            onClick={() => {
              if (step === 'overwrite') {
                mutate((l) => void overwritePlaybook(l, pb.id));
                toast(`Saved your tactics as "${pb.name}"`, 'good');
                setStep('view');
              } else {
                mutate((l) => deletePlaybook(l, pb.id));
                toast(`Deleted "${pb.name}"`);
                close();
              }
            }}
          >
            {step === 'overwrite' ? 'Overwrite' : 'Delete'}
          </button>
        </div>
      </div>
    );
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="small dim2">
        {playbookLabel(pb)} · saved {fmtDate(pb.saved.season, pb.saved.day, { month: 'short', day: 'numeric', year: 'numeric' })}
      </div>
      {diff.length ? (
        <div className="col" style={{ gap: 6 }}>
          <div className="tiny dim upper bold">{inUse ? 'Loading it again puts back' : 'Loading it changes'}</div>
          <Changes list={diff} />
        </div>
      ) : (
        <div className="small">Your tactics are the same as this playbook{inUse ? '' : ' (loading it marks them as coming from it)'}.</div>
      )}
      <div className="tiny dim">Roles, shot freedom and screeners load for the players still on your roster; everyone else keeps his own.</div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary grow" onClick={load} disabled={inUse && !diff.length}>
          {inUse && !diff.length ? 'In use' : 'Load'}
        </button>
        <button className="btn grow" onClick={compare} disabled={!diff.length} aria-label={`Compare "${pb.name}" with your current tactics in the Lab`}>
          <FlaskConical size={16} /> Compare
        </button>
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <button className="btn sm" onClick={() => setStep('overwrite')}>
          Overwrite with current
        </button>
        <button className="btn sm" onClick={() => setStep('rename')}>
          Rename
        </button>
        <button className="btn sm danger" onClick={() => setStep('delete')}>
          Delete
        </button>
      </div>
    </div>
  );
}

export function MyPlaybooksCard() {
  const league = useLeague();
  const lib = playbookLibrary(league);
  const cur = useCurrent(league);
  const [open, setOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pb = lib.find((p) => p.id === open);
  const full = lib.length >= MAX_PLAYBOOKS;
  return (
    <Card
      title="My playbooks"
      right={
        <div className="row" style={{ gap: 8 }}>
          <span className="tiny dim num">
            {lib.length}/{MAX_PLAYBOOKS}
          </span>
          <Help title="My playbooks">
            <p>Save your tactics as a playbook to come back to them: a playbook for the regular season, one for the playoffs, a small-ball set for when your center is hurt.</p>
            <p>
              A playbook keeps the schemes, every setting and your game management. Roles, shot freedom and screeners are saved by player and only load for players still on your
              roster. Matchups and star targets are game by game, so they aren't saved.
            </p>
            <p>Your playbooks are yours: they come with you if you take over another team.</p>
          </Help>
        </div>
      }
    >
      {lib.length === 0 ? (
        <div className="small dim">No saved playbooks yet. Save your tactics as they are to load them again later, or to compare them with a change in the Lab.</div>
      ) : (
        <div className="list" style={{ margin: '0 -14px' }}>
          {lib.map((p) => {
            const using = cur?.pb.id === p.id;
            return (
              <div
                key={p.id}
                className="listrow clickable"
                role="button"
                tabIndex={0}
                aria-haspopup="dialog"
                aria-label={`${p.name}${using ? (cur.changes.length ? ', in use, edited' : ', in use') : ''}`}
                onClick={() => setOpen(p.id)}
                onKeyDown={activateOnKey(() => setOpen(p.id))}
              >
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 6, minWidth: 0 }}>
                    <span className="bold ellipsis" style={{ minWidth: 0 }}>
                      {p.name}
                    </span>
                    {using && <Tag tone={cur.changes.length ? 'warn' : 'good'}>{cur.changes.length ? 'Edited' : 'In use'}</Tag>}
                  </div>
                  <div className="tiny dim ellipsis">{playbookLabel(p)}</div>
                </div>
                <ChevronRight size={16} className="dim" style={{ flex: 'none' }} />
              </div>
            );
          })}
        </div>
      )}
      <button className="btn block" style={{ marginTop: 12 }} onClick={() => setSaving(true)} disabled={full}>
        <Save size={16} /> Save current as…
      </button>
      {full && <div className="tiny dim" style={{ marginTop: 6 }}>{`You have ${MAX_PLAYBOOKS}: overwrite or delete one to save another.`}</div>}
      <Sheet open={saving} onClose={() => setSaving(false)} title="Save as a playbook">
        <div className="small dim2" style={{ marginBottom: 10 }}>
          {playbookLabel(league.teams[league.userTid].tactics)}, with your roles, shot freedom, screeners and game management.
        </div>
        <NameForm
          initial=""
          label="Save"
          submit={(name) => {
            const err = playbookNameError(league, name);
            if (err) return err;
            useStore.getState().mutate((l) => void savePlaybook(l, name));
            setSaving(false);
            // (named as it was saved: trimmed, runs of spaces as one)
            useStore.getState().toast(`Saved "${name.trim().replace(/\s+/g, ' ')}"`, 'good');
            return null;
          }}
        />
      </Sheet>
      <Sheet open={!!pb} onClose={() => setOpen(null)} title={pb?.name}>
        {pb && <PlaybookSheet key={pb.id} pb={pb} close={() => setOpen(null)} />}
      </Sheet>
    </Card>
  );
}
