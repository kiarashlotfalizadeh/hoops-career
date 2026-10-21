// The main menu (/start): the league played last one tap away, a new league, a backup to import, and
// the other saved leagues. Saves from before the redesign can't be opened: they're listed to keep (as a
// file) or delete.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Download, Plus, Trash2 } from 'lucide-react';
import { deleteLeague, listLeagues, loadLeague, openable, type LeagueMeta } from '../../state/persistence';
import { exportRawSave } from '../../state/backup';
import { useStore } from '../../state/store';
import { PHASE_LABEL, seasonLabel } from '../../core/constants';
import { TeamLogo } from '../components/TeamLogo';
import { FRANCHISES } from '../../core/teams';
import { Section, Sheet } from '../components/ui';
import { BrandMark } from '../components/BrandMark';
import { slabVars } from '../teamColors';
import './start.css';
import { ImportButton } from '../components/ImportButton';
import { UnsavedSheet } from '../components/UnsavedSheet';

export default function Start() {
  const nav = useNavigate();
  const setLeague = useStore((s) => s.setLeague);
  const [leagues, setLeagues] = useState<LeagueMeta[] | null>(null);
  const [confirm, setConfirm] = useState<LeagueMeta | null>(null);
  // the league to open once the user decides about the open one's unsaved changes
  const [unsaved, setUnsaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () =>
    listLeagues()
      .then((all) => {
        setLeagues(all);
        setError(null);
      })
      .catch((e) => {
        console.error(e);
        setError('Saved leagues could not be read from device storage (private browsing, or site data blocked in the browser settings).');
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
      useStore.getState().toast(`That save could not be opened. ${e instanceof Error ? e.message : ''}`, 'bad');
    }
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
  // the league played last that this version can open, and the rest (its Delete is in Settings)
  const latest = leagues?.find(openable);
  const others = leagues?.filter((m) => m !== latest) ?? [];
  const tidOf = (m: LeagueMeta) => m.userTid ?? FRANCHISES.findIndex((f) => f.abbrev === m.teamAbbrev);
  return (
    <main className="page standalone st-page st-menu">
      {/* the masthead: the wordmark set in the serif, the mark as its ornament */}
      <header className="st-hero">
        <BrandMark size={34} className="st-mark" />
        <h1 className="st-word">
          Hoops <em>Career</em>
        </h1>
        <p className="st-tag">GM and head coach of a real 2026-27 roster.</p>
      </header>
      {latest && (
        // the league played last, one tap from where you left it
        <button className="slab st-continue" style={slabVars(latest.colors)} onClick={() => void open(latest.id)}>
          <span className="st-c-over">
            <span>
              Continue · {seasonLabel(latest.season)} · {PHASE_LABEL[latest.phase]}
            </span>
            <ChevronRight size={20} aria-hidden="true" />
          </span>
          <span className="st-c-main">
            <TeamLogo tid={Math.max(0, tidOf(latest))} size={48} abbrev={latest.teamAbbrev} colors={latest.colors} decorative />
            <span className="grow">
              <span className="st-c-team">{latest.teamName}</span>
              <span className="st-c-name ellipsis">{latest.name}</span>
            </span>
            <span className="num st-c-rec">{latest.record}</span>
          </span>
        </button>
      )}
      <div className="col st-actions">
        {/* (with a league to continue, that card leads: a new one is the second choice) */}
        <button className={`btn ${latest ? '' : 'primary'} big block`} onClick={() => nav('/new')}>
          <Plus size={18} aria-hidden="true" /> New league
        </button>
        <ImportButton block ghost />
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
                      {/* two lines, so the record isn't the part a phone cuts off */}
                      <span className="lr-meta ellipsis">
                        {m.teamName} · <span className="num">{m.record}</span>
                      </span>
                      <span className="lr-meta ellipsis">
                        {seasonLabel(m.season)} · {PHASE_LABEL[m.phase]}
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
          “{confirm?.name}” will be removed from this device for good.
          {confirm && !openable(confirm) ? ' Export its save file first to keep a copy.' : ''}
        </p>
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn grow" onClick={() => setConfirm(null)}>
            Cancel
          </button>
          <button className="btn danger grow" onClick={() => confirm && void remove(confirm)}>
            Delete
          </button>
        </div>
      </Sheet>
    </main>
  );
}
