import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { deleteLeague, listLeagues, loadLeague, type LeagueMeta } from '../../state/persistence';
import { useStore } from '../../state/store';
import { PHASE_LABEL, seasonLabel } from '../../core/constants';
import { TeamLogo } from '../components/TeamLogo';
import { FRANCHISES } from '../../core/teams';
import { Card, Empty, Sheet } from '../components/ui';

export default function Start() {
  const nav = useNavigate();
  const setLeague = useStore((s) => s.setLeague);
  const [leagues, setLeagues] = useState<LeagueMeta[] | null>(null);
  const [confirm, setConfirm] = useState<LeagueMeta | null>(null);
  const refresh = () => listLeagues().then(setLeagues).catch(() => setLeagues([]));
  useEffect(() => {
    void refresh();
  }, []);
  const open = async (id: string) => {
    const l = await loadLeague(id);
    if (l) {
      setLeague(l);
      nav('/');
    }
  };
  return (
    <main className="page" style={{ paddingBottom: 40 }}>
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
      <Card title="Saved leagues">
        {leagues === null ? (
          <Empty>Loading…</Empty>
        ) : leagues.length === 0 ? (
          <Empty>No saved leagues yet.</Empty>
        ) : (
          <div className="list" style={{ margin: '0 -14px' }}>
            {leagues.map((m) => {
              const tid = FRANCHISES.findIndex((f) => f.abbrev === m.teamAbbrev);
              return (
                <div key={m.id} className="listrow clickable" onClick={() => void open(m.id)}>
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
          <button
            className="btn danger grow"
            onClick={async () => {
              if (confirm) await deleteLeague(confirm.id);
              setConfirm(null);
              void refresh();
            }}
          >
            Delete
          </button>
        </div>
      </Sheet>
    </main>
  );
}
