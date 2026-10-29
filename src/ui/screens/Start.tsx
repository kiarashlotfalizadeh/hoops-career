// The main menu (/start): the league played last one tap away, a new league, a backup to import, and
// the other saved leagues. Saves from before the redesign can't be opened: they're listed to keep (as a
// file) or delete. Deleting offers a backup first; a save that won't open offers its season snapshot.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Download, Plus, Trash2 } from 'lucide-react';
import { deleteLeague, listLeagues, loadLeague, openable, type LeagueMeta } from '../../state/persistence';
import { exportLeague, exportRawSave } from '../../state/backup';
import { useStore } from '../../state/store';
import { PHASE_LABEL, START_SEASON, seasonLabel } from '../../core/constants';
import { TeamLogo } from '../components/TeamLogo';
import { FRANCHISES } from '../../core/teams';
import { Section, Sheet, Statline } from '../components/ui';
import { BrandMark } from '../components/BrandMark';
import { slabVars } from '../teamColors';
import './start.css';
import { ImportButton } from '../components/ImportButton';
import { UnsavedSheet } from '../components/UnsavedSheet';
import { SnapshotActions, snapshotText, useSnapshot } from '../components/Backup';
import type { League } from '../../core/types';

export default function Start() {
  const nav = useNavigate();
  const setLeague = useStore((s) => s.setLeague);
  const [leagues, setLeagues] = useState<LeagueMeta[] | null>(null);
  const [confirm, setConfirm] = useState<LeagueMeta | null>(null);
  // the league to open once the user decides about the open one's unsaved changes
  const [unsaved, setUnsaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // a save that couldn't be opened, and why: its season snapshot is offered, if it has one
  const [broken, setBroken] = useState<{ m: LeagueMeta; why: string } | null>(null);
  const snap = useSnapshot(broken?.m.id);
  const refresh = () =>
    listLeagues()
      .then((all) => {
        setLeagues(all);
        setError(null);
      })
      .catch((e) => {
        console.error(e);
        setError('Saved leagues could not be read from this device. Private browsing or blocked site data can cause this.');
        setLeagues([]);
      });
  useEffect(() => {
    void refresh();
  }, []);
  const open = async (id: string, force = false) => {
    // still open (Back from the game to here): a copy from the device would drop its latest changes,
    // unless another window has saved over them
    const st = useStore.getState();
    if (st.league?.id === id && st.saveProblem?.kind !== 'conflict') {
      nav('/');
      return;
    }
    // another league still open behind this screen saves first: if it can't, say so rather than drop its changes
    if (!force && st.league && !(await st.saveBeforeLeaving())) {
      setUnsaved(id);
      return;
    }
    try {
      const l = await loadLeague(id);
      if (!l) throw new Error('That save is no longer on this device.');
      setLeague(l);
      nav('/');
    } catch (e) {
      console.error(e);
      const why = e instanceof Error ? e.message : '';
      const m = leagues?.find((x) => x.id === id);
      // with a season snapshot, the sheet offers it; without, the toast is all there is
      if (m?.snap) setBroken({ m, why });
      else useStore.getState().toast(`That save could not be opened. ${why}`, 'bad');
    }
  };
  /** The season snapshot of a save that wouldn't open, restored as a league of its own: opened right away. */
  const restored = (l: League) => {
    setBroken(null);
    setLeague(l);
    nav('/');
  };
  const remove = async (m: LeagueMeta) => {
    setConfirm(null);
    // the league still open behind this screen goes with it
    if (useStore.getState().league?.id === m.id) setLeague(null);
    try {
      await deleteLeague(m.id);
    } catch (e) {
      console.error(e);
      useStore.getState().toast(`"${m.name}" could not be deleted.`, 'bad');
    }
    void refresh();
  };
  // an older save, kept as a file before it goes (a cancelled share sheet is no failure)
  const keep = (m: LeagueMeta) =>
    void exportRawSave(m.id).catch((e) => {
      console.error(e);
      useStore.getState().toast('Export failed.', 'bad');
    });
  // a backup before a delete: the league as this build reads it (the open one as it stands), or the
  // save as it's stored when it can't be read
  const backupFirst = async (m: LeagueMeta) => {
    try {
      const open = useStore.getState().league;
      const l = !openable(m) ? null : open?.id === m.id ? open : await loadLeague(m.id).catch(() => null);
      await (l ? exportLeague(l) : exportRawSave(m.id));
    } catch (e) {
      console.error(e);
      useStore.getState().toast('Export failed.', 'bad');
    }
  };
  // the league played last that this version can open, and the rest (its Delete is in Settings)
  const latest = leagues?.find(openable);
  const others = leagues?.filter((m) => m !== latest) ?? [];
  const tidOf = (m: LeagueMeta) => m.userTid ?? FRANCHISES.findIndex((f) => f.abbrev === m.teamAbbrev);
  return (
    <main className="page standalone st-page st-menu">
      {/* the masthead: the wordmark as a poster's headline, the box score's line under it */}
      <header className="st-hero">
        <BrandMark size={30} className="st-mark" />
        <h1 className="st-word">
          Hoops
          <br />
          Career
        </h1>
        <p className="st-tag">GM and head coach of a real NBA roster. Build it in the office, coach it on the floor.</p>
        <Statline
          items={[
            { k: 'Teams', v: String(FRANCHISES.length) },
            { k: 'Games', v: '82' },
            { k: 'Season', v: seasonLabel(START_SEASON) },
          ]}
        />
      </header>
      {latest && (
        // the league played last, one tap from where you left it: its team's poster
        <button className="slab st-continue" style={slabVars(latest.colors)} onClick={() => void open(latest.id)}>
          <span className="st-c-over">
            <span className="ellipsis">
              Continue · {seasonLabel(latest.season)} · {PHASE_LABEL[latest.phase]}
            </span>
            <ChevronRight size={18} aria-hidden="true" />
          </span>
          <span className="st-c-main">
            <span className="st-c-who">
              <TeamLogo tid={Math.max(0, tidOf(latest))} size={44} abbrev={latest.teamAbbrev} colors={latest.colors} decorative />
              <span className="st-c-team">{latest.teamName}</span>
              <span className="st-c-name ellipsis">{latest.name}</span>
            </span>
            <span className="st-c-rec">{latest.record}</span>
          </span>
        </button>
      )}
      <div className="col st-actions">
        {/* (with a league to continue, that card leads: a new one is the second choice) */}
        <button className={`btn ${latest ? '' : 'primary'} big block`} onClick={() => nav('/new')}>
          <Plus size={18} aria-hidden="true" /> New league
        </button>
        <ImportButton block text />
      </div>
      {/* (nothing else saved: the Continue card and New league are all there is to say) */}
      {error ? (
        <div className="empty small" role="alert">
          {error}
        </div>
      ) : !others.length ? null : (
        <Section title={latest ? 'Other leagues' : 'Saved leagues'}>
          <div className="card flush list">
            {others.map((m) => {
              const tid = tidOf(m);
              // (as the league has it: god mode can rename and recolour a team)
              const logo = <TeamLogo tid={tid >= 0 ? tid : 0} size={36} abbrev={m.teamAbbrev} colors={m.colors} decorative />;
              if (!openable(m))
                return (
                  <div key={m.id} className="st-row old">
                    <div className="st-open">
                      <span className="st-logo">{logo}</span>
                      <span className="grow">
                        <span className="lr-name ellipsis">{m.name}</span>
                        <span className="lr-meta ellipsis">Older version: can't be opened</span>
                      </span>
                    </div>
                    <button className="iconbtn" aria-label={`Export the save file of ${m.name}`} onClick={() => keep(m)}>
                      <Download size={18} />
                    </button>
                    <button className="iconbtn" aria-label={`Delete ${m.name}`} onClick={() => setConfirm(m)}>
                      <Trash2 size={18} />
                    </button>
                  </div>
                );
              return (
                <div key={m.id} className="st-row">
                  {/* open and Delete are sibling buttons; this one reaches the row's edges */}
                  <button type="button" className="st-open" onClick={() => void open(m.id)}>
                    {logo}
                    <span className="grow">
                      <span className="lr-name ellipsis">{m.name}</span>
                      {/* the team's record first, so it isn't the part a phone cuts off */}
                      <span className="lr-meta ellipsis">
                        <span className="num">{m.record}</span> · {m.teamName} · {seasonLabel(m.season)}
                      </span>
                    </span>
                  </button>
                  <button className="iconbtn" aria-label={`Delete ${m.name}`} onClick={() => setConfirm(m)}>
                    <Trash2 size={18} />
                  </button>
                </div>
              );
            })}
          </div>
        </Section>
      )}
      <UnsavedSheet
        open={!!unsaved}
        title="Switch without saving?"
        proceed="Open anyway"
        onStay={() => setUnsaved(null)}
        onProceed={() => {
          const id = unsaved;
          setUnsaved(null);
          if (id) void open(id, true);
        }}
      />
      <Sheet open={!!confirm} onClose={() => setConfirm(null)} title="Delete league?">
        <p className="dim2" style={{ marginTop: 0 }}>
          “{confirm?.name}” will be removed from this device for good, its season snapshot with it.
        </p>
        <button className="btn primary block" onClick={() => confirm && void backupFirst(confirm)}>
          <Download size={16} /> {confirm && !openable(confirm) ? 'Export its save file first' : 'Export a backup first'}
        </button>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn grow" onClick={() => setConfirm(null)}>
            Cancel
          </button>
          <button className="btn danger grow" onClick={() => confirm && void remove(confirm)}>
            Delete
          </button>
        </div>
      </Sheet>
      <Sheet open={!!broken} onClose={() => setBroken(null)} title="That save won't open">
        <div className="col" style={{ gap: 12 }}>
          <div className="dim2">
            “{broken?.m.name}” could not be read. {broken?.why} {snap ? `The device kept a snapshot of it: ${snapshotText(snap)}.` : ''}
          </div>
          {broken && snap && <SnapshotActions id={broken.m.id} snap={snap} onRestored={restored} />}
          <button className="btn block" onClick={() => setBroken(null)}>
            Close
          </button>
        </div>
      </Sheet>
    </main>
  );
}
