import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { deleteLeague, listLeagues, loadLeague, type LeagueMeta } from '../../state/persistence';
import { useStore } from '../../state/store';
import { PHASE_LABEL, seasonLabel } from '../../core/constants';
import { TeamLogo } from '../components/TeamLogo';
import { FRANCHISES } from '../../core/teams';
import { Card, Empty, Sheet, activateOnKey } from '../components/ui';
import { ImportButton } from '../components/ImportButton';

export default function Start() {
  const nav = useNavigate();
  const setLeague = useStore((s) => s.setLeague);
  const [leagues, setLeagues] = useState<LeagueMeta[] | null>(null);
  const [confirm, setConfirm] = useState<LeagueMeta | null>(null);
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
  const open = async (id: string) => {
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
    try {
      await deleteLeague(m.id);
    } catch (e) {
      console.error(e);
      useStore.getState().toast(`"${m.name}" could not be deleted.`, 'bad');
    }
    void refresh();
  };
  return (
    <main className="page standalone" style={{ paddingBottom: 40 }}>
      <div className="col" style={{ alignItems: 'center', textAlign: 'center', marginTop: 28, gap: 6 }}>
        <div className="row" style={{ gap: 6 }}>
          {[19, 13, 20, 1, 7].map((tid) => (
            <TeamLogo key={tid} tid={tid} size={30} />
          ))}
        </div>
        <h1 style={{ fontSize: 46, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 10 }}>Hoops Career</h1>
        <div className="dim2" style={{ maxWidth: 420 }}>
          Run an NBA franchise as GM and head coach. Real 2026-27 rosters, a possession-by-possession engine, and a tactics layer that explains every decision.
        </div>
      </div>
      <button className="btn primary big block" onClick={() => nav('/new')}>
        <Plus size={20} /> New League
      </button>
      <ImportButton block />
      <Card title="Saved leagues">
        {leagues === null ? (
          <Empty>Loading…</Empty>
        ) : leagues.length === 0 ? (
          <Empty>{error ?? 'No saved leagues yet.'}</Empty>
        ) : (
          <div className="list" style={{ margin: '0 -14px' }}>
            {leagues.map((m) => {
              const tid = FRANCHISES.findIndex((f) => f.abbrev === m.teamAbbrev);
              return (
                <div key={m.id} className="listrow clickable" role="button" tabIndex={0} onClick={() => void open(m.id)} onKeyDown={activateOnKey(() => void open(m.id))}>
                  <TeamLogo tid={tid >= 0 ? tid : 0} size={38} />
                  <div className="grow">
                    <div className="bold ellipsis">{m.name}</div>
                    <div className="small dim ellipsis">
                      {m.teamName} · {seasonLabel(m.season)} · {PHASE_LABEL[m.phase]} · {m.record}
                    </div>
                  </div>
                  <button
                    className="iconbtn"
                    aria-label="Delete league"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirm(m);
                    }}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <Sheet open={!!confirm} onClose={() => setConfirm(null)} title="Delete league?">
        <p className="dim2">“{confirm?.name}” will be permanently removed from this device.</p>
        <div className="row" style={{ marginTop: 12 }}>
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
