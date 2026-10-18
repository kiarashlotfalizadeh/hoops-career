// The Games hub: your schedule, the spine of the season. (A first cut: the redesign fills it in.)
import { useLeague } from '../../state/store';
import { PageHeader } from '../components/ui';
import { TeamScheduleList } from '../league/Schedule';

export default function GamesHub() {
  const league = useLeague();
  return (
    <main className="page">
      <PageHeader title="Games" />
      <TeamScheduleList league={league} tid={league.userTid} />
    </main>
  );
}
