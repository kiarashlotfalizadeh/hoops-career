// Job security as the Office reads it: the hub's Owner line and the Owner desk's meter agree, in
// season using the season forecast's wins (the odds line's), as the owner's goals do.
import type { League } from '../../core/types';
import { leagueForecast } from '../../core/analysis/odds';
import { jobSecurity, type JobSecurity } from '../../core/league/jobSecurity';

/** The forecast the owner's projection uses, in season only. */
export const forecastFor = (league: League) => (league.phase === 'regular' ? leagueForecast(league) : null);

export const seatOf = (league: League): JobSecurity => jobSecurity(league, forecastFor(league));
