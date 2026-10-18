// A player's page, Growth: his OVR season by season, the outlook for his age with his potential and
// wear, and (your own player) his training focus.
import type { League, Player, TrainingFocus } from '../../core/types';
import { RETIRED } from '../../core/types';
import { seasonLabel } from '../../core/constants';
import { playerAge } from '../../core/playerGen';
import { FOCUS_META } from '../../core/league/progression';
import { edit } from '../../state/actions';
import { useStore } from '../../state/store';
import { Chips, Help, Section, Statline } from '../components/ui';
import { LineChart } from '../components/charts';

export function GrowthTab({ p, league, mine }: { p: Player; league: League; mine: boolean }) {
  const hist = p.ratingsHistory;
  const age = playerAge(p, league.season);
  const busy = useStore((s) => !!s.sim);
  return (
    <>
      <Section title="Overall by season">
        <div className="card">
          {hist.length > 1 ? (
            <LineChart points={hist.map((h) => h.ovr)} labels={hist.map((h) => `'${String(h.season).slice(2)}`)} />
          ) : (
            <div className="small dim">
              History builds as seasons pass. Now {p.ovr} OVR, potential {p.pot}.
            </div>
          )}
        </div>
      </Section>
      <Section
        title="Outlook"
        right={
          <Help title="How players develop">
            Players follow age curves: skills and IQ improve into the late 20s, while speed and explosiveness peak around 24-27 and then decline. On top of that come a hidden
            personal growth tendency, coaching quality (coach + coaching budget), practice intensity, playing time for young players (25+ minutes helps), and each player's training
            focus.
          </Help>
        }
      >
        <div className="card tm-outlook">
          <div className="tm-outlook-l">
            {p.tid === RETIRED
              ? `Retired${p.retiredSeason ? ` after the ${seasonLabel(p.retiredSeason)} season` : ''}.`
              : age <= 22
                ? 'Young and raw: big jumps come with minutes and good coaching.'
                : age <= 26
                  ? 'Still improving, especially skills and decisions.'
                  : age <= 30
                    ? 'In his prime: skill gains offset early athletic decline.'
                    : age <= 33
                      ? 'Veteran: athleticism fades; IQ and shooting hold up.'
                      : 'Late career: steady decline; conditioning work slows it.'}
          </div>
          <Statline
            items={[
              { k: 'Age', v: age },
              { k: 'Potential', v: p.pot, s: p.pot > p.ovr ? `+${p.pot - p.ovr} to go` : 'reached' },
              ...(p.tid >= 0
                ? [{ k: 'Season wear', v: `${Math.round(p.wear)}/100`, s: p.wear > 50 ? 'needs rest' : 'fresh', color: p.wear > 50 ? 'var(--warn)' : undefined }]
                : []),
            ]}
          />
        </div>
      </Section>
      {mine && (
        <Section title="Training focus">
          <div className="card tm-train">
            <Chips
              label="Training focus"
              value={p.training}
              disabled={busy}
              onChange={(f: TrainingFocus) => edit((l) => void (l.players[p.pid].training = f))}
              options={(Object.keys(FOCUS_META) as TrainingFocus[]).map((k) => ({ id: k, label: FOCUS_META[k].label }))}
            />
            <div className="small dim">{FOCUS_META[p.training].help}</div>
          </div>
        </Section>
      )}
    </>
  );
}
