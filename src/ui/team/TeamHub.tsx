// The Team hub: your team in one place. Its sections are page tabs with their own paths (/team,
// /team/rotation, /team/tactics, /team/lineups), each the screen it names.
import { useNavigate, useParams } from 'react-router-dom';
import { lazyRetry } from '../lazyRetry';
import { TabBar } from '../league/shared';

const Roster = lazyRetry(() => import('../screens/Roster'));
const Rotation = lazyRetry(() => import('../screens/Rotation'));
const Tactics = lazyRetry(() => import('../screens/Tactics'));
const Lineups = lazyRetry(() => import('../screens/Lineups'));

type Section = 'roster' | 'rotation' | 'tactics' | 'lineups';
const SECTIONS: { id: Section; label: string }[] = [
  { id: 'roster', label: 'Roster' },
  { id: 'rotation', label: 'Rotation' },
  { id: 'tactics', label: 'Tactics' },
  { id: 'lineups', label: 'Lineups' },
];

export default function TeamHub() {
  const { tab } = useParams();
  const nav = useNavigate();
  const section = SECTIONS.find((s) => s.id === tab)?.id ?? 'roster';
  return (
    <>
      <div className="page" style={{ paddingBottom: 0 }}>
        <TabBar value={section} options={SECTIONS} onChange={(s) => nav(s === 'roster' ? '/team' : `/team/${s}`)} label="Team sections" />
      </div>
      {section === 'roster' && <Roster />}
      {section === 'rotation' && <Rotation />}
      {section === 'tactics' && <Tactics />}
      {section === 'lineups' && <Lineups />}
    </>
  );
}
