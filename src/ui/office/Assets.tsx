// Office → Picks & moves: the user's draft picks (owned and owed, with their protections and swap
// rights) and his team's transaction log. The same lists another team's page shows, for his own.
import { useLeague } from '../../state/store';
import { PageHeader } from '../components/ui';
import { TabBar, useQueryParam } from '../league/shared';
import { PicksList } from '../league/PicksList';
import { MovesTab } from '../league/MovesTab';

type Tab = 'picks' | 'moves';
const TABS: { id: Tab; label: string }[] = [
  { id: 'picks', label: 'Picks' },
  { id: 'moves', label: 'Moves' },
];

export default function Assets() {
  const league = useLeague();
  const [tab, setTab] = useQueryParam<Tab>('tab', 'picks', ['picks', 'moves']);
  return (
    <main className="page fo-page">
      <PageHeader title="Picks & moves" back backTo="/office" />
      <TabBar value={tab} onChange={setTab} options={TABS} label="Picks and moves" />
      {tab === 'picks' ? <PicksList league={league} tid={league.userTid} /> : <MovesTab league={league} tid={league.userTid} />}
    </main>
  );
}
