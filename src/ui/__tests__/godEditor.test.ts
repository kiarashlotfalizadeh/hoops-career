// God mode's editor sheets: Save sends what was changed in the sheet, measured from the form as it
// opened, so a sim that ran with the sheet open (wear, mood, health, a trade, the team's cash) isn't
// put back by it.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../../core/league/create';
import { standardRoster } from '../../core/league/helpers';
import { editOf as playerEdit, formOf as playerForm } from '../god/PlayerEditor';
import { editOf as teamEdit, formOf as teamForm } from '../god/TeamEditor';

const league = () => createLeague({ name: 'god-ui', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 7 });

describe('player editor', () => {
  it('sends nothing for an untouched sheet, whatever moved since it opened', () => {
    const l = league();
    const p = standardRoster(l, 0)[0];
    const base = playerForm(l, p);
    // what a sim does to him meanwhile
    p.wear = 40;
    p.mood.score = -6;
    p.mood.tradeRequest = true;
    p.injury = { type: 'Sprained Ankle', gamesRemaining: 3, gamesTotal: 3, severity: 'minor' };
    p.tid = 1;
    expect(playerEdit(base, { ...base })).toEqual({});
  });

  it('sends only the fields changed, as typed (an unreadable number goes in for the checks to name)', () => {
    const l = league();
    const p = standardRoster(l, 0)[0];
    const base = playerForm(l, p);
    expect(playerEdit(base, { ...base, mood: base.mood + 2 })).toEqual({ mood: { score: base.mood + 2 } });
    expect(playerEdit(base, { ...base, tradeRequest: !base.tradeRequest })).toEqual({ mood: { tradeRequest: !base.tradeRequest } });
    expect(playerEdit(base, { ...base, age: ` ${base.age} ` })).toEqual({});
    expect(playerEdit(base, { ...base, age: 'abc' }).age).toBeNaN();
    expect(playerEdit(base, { ...base, injury: { type: 'Sprained Ankle', games: '' } }).injury?.games).toBeNaN();
  });

  it('a new salary runs for the seasons shown', () => {
    const l = league();
    const p = standardRoster(l, 0)[0];
    const base = playerForm(l, p);
    const e = playerEdit(base, { ...base, amount: '12.34', touched: { amount: true } });
    expect(e.contract).toEqual({ amount: 12_340, years: base.years });
  });
});

describe('team editor', () => {
  it('leaves the balance, hype and coach a sim moved alone, and sends the one coach rating changed', () => {
    const l = league();
    const t = l.teams[3];
    const base = teamForm(t);
    t.cash += 2_345;
    t.hype = Math.min(1, t.hype + 0.2);
    t.coach.development = 99;
    expect(teamEdit(base, { ...base })).toEqual({});
    expect(teamEdit(base, { ...base, tactics: base.tactics === 50 ? 51 : 50 })).toEqual({ coach: { tactics: base.tactics === 50 ? 51 : 50 } });
  });
});
