// A player's page (/player/:pid): his slab, then Overview, Ratings, Stats, Games and Growth (the
// tabs live in src/ui/player), and the sheets his page opens: role, release, extension, compare,
// and god mode's editor.
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Pencil, Scale } from 'lucide-react';
import { useLeague } from '../../state/store';
import { DRAFT_PROSPECT, FREE_AGENT } from '../../core/types';
import { Empty, PageHeader, Segmented, Sheet } from '../components/ui';
import { RoleEditor } from '../components/RoleEditor';
import { PlayerPicker } from '../components/PlayerPicker';
import { ReleaseConfirm } from '../office/common';
import { ContractSheet } from '../office/ContractSheet';
import { useQueryParam } from '../league/shared';
import { compareHref } from '../compare';
import { LazyPlayerEditor } from '../god/lazy';
import { useBack } from '../nav';
import { PlayerHero } from '../player/Hero';
import { Overview } from '../player/Overview';
import { deskBlocks } from '../player/Contract';
import { RatingsTab } from '../player/RatingsTab';
import { StatsTab } from '../player/StatsTab';
import { GameLog } from '../player/GameLog';
import { GrowthTab } from '../player/GrowthTab';
import './team.css';

type Tab = 'overview' | 'ratings' | 'stats' | 'log' | 'dev';

export default function PlayerView() {
  const league = useLeague();
  const nav = useNavigate();
  const { pid } = useParams();
  const p = league.players[Number(pid)];
  const [tab, setTab] = useQueryParam<Tab>('tab', 'overview', ['overview', 'ratings', 'stats', 'log', 'dev']);
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [extending, setExtending] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [editing, setEditing] = useState(false);
  // back with nothing behind: your player to Team, another team's to its page, the rest to where they're kept
  const goBack = useBack(
    !p || p.tid === league.userTid
      ? '/team'
      : p.tid >= 0
        ? `/teams/${p.tid}`
        : p.tid === FREE_AGENT
          ? '/office/free-agents'
          : p.tid === DRAFT_PROSPECT
            ? '/office/draft'
            : '/league/history',
  );
  if (!p) {
    return (
      <main className="page">
        <PageHeader title="Player" back backTo="/team" />
        <div className="card">
          <Empty>That player is no longer in the league.</Empty>
        </div>
      </main>
    );
  }
  const { mine, releaseWhy } = deskBlocks(league, p);

  return (
    <main className="page tm-pv">
      <div className="tm-bar">
        <button className="iconbtn back" onClick={goBack} aria-label="Back">
          <ChevronLeft size={24} />
        </button>
        <span className="grow" />
        {league.settings.godMode && (
          <button className="btn sm ghost" aria-haspopup="dialog" onClick={() => setEditing(true)}>
            <Pencil size={15} /> Edit
          </button>
        )}
        <button className="btn sm ghost" aria-haspopup="dialog" onClick={() => setComparing(true)}>
          <Scale size={15} /> Compare
        </button>
      </div>

      <PlayerHero league={league} p={p} />

      <div className="tm-tabs five">
        <Segmented
          tabs
          value={tab}
          onChange={setTab}
          label="Player sections"
          options={[
            { id: 'overview', label: 'Overview' },
            { id: 'ratings', label: 'Ratings' },
            { id: 'stats', label: 'Stats' },
            { id: 'log', label: 'Games' },
            { id: 'dev', label: 'Growth' },
          ]}
        />
      </div>

      {tab === 'overview' && <Overview league={league} p={p} onRole={() => setRoleOpen(true)} onExtend={() => setExtending(true)} onRelease={() => setConfirmRelease(true)} />}
      {tab === 'ratings' && <RatingsTab p={p} league={league} />}
      {tab === 'stats' && <StatsTab p={p} league={league} />}
      {tab === 'log' && <GameLog p={p} league={league} onOpen={(gid) => nav(`/game/${gid}`)} />}
      {tab === 'dev' && <GrowthTab p={p} league={league} mine={mine} />}

      {/* (loaded the first time it opens) */}
      {editing && league.settings.godMode && <LazyPlayerEditor pid={p.pid} onClose={() => setEditing(false)} />}
      <Sheet open={roleOpen} onClose={() => setRoleOpen(false)} title={`${p.lastName}: role`}>
        <RoleEditor p={p} onDone={() => setRoleOpen(false)} />
      </Sheet>
      <Sheet open={confirmRelease && mine && !releaseWhy} onClose={() => setConfirmRelease(false)} title={`Release ${p.lastName}?`}>
        <div className="col" style={{ gap: 12 }}>
          <ReleaseConfirm league={league} p={p} onKeep={() => setConfirmRelease(false)} onDone={() => (setConfirmRelease(false), nav('/team'))} />
        </div>
      </Sheet>
      <ContractSheet pid={extending && mine ? p.pid : null} mode="extend" onClose={() => setExtending(false)} />
      <PlayerPicker open={comparing} onClose={() => setComparing(false)} anchor={p} title={`Compare ${p.lastName} with…`} onPick={(other) => nav(compareHref(p.pid, other))} />
    </main>
  );
}
