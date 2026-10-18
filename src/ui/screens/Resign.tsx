// Office → Re-sign: in the re-sign period, the desk where your expiring players are kept or let go
// (ResignPeriod); the rest of the year, who is up next and who can be extended now (ResignClosed).
import { useLeague } from '../../state/store';
import { ResignClosed } from '../office/ResignClosed';
import { ResignPeriod } from '../office/ResignPeriod';

export default function Resign() {
  const league = useLeague();
  return league.phase === 'resign' ? <ResignPeriod /> : <ResignClosed league={league} />;
}
