// The privacy policy (/privacy): one page, open with or without a league. Its text is privacy.json,
// which the build also writes out as privacy.html (vite.config.ts), the address a store listing asks for.
import { PageHeader } from '../components/ui';
import policy from './privacy.json';
import './start.css';

export default function Privacy() {
  return (
    <main className="page standalone st-page pv-page">
      <PageHeader title={policy.title} sub={`Updated ${policy.updated}`} back backTo="/start" />
      <p className="pv-lead">{policy.lead}</p>
      {policy.sections.map((s) => (
        <section key={s.h} className="pv-sec">
          <h2>{s.h}</h2>
          {s.p.map((t) => (
            <p key={t}>{t}</p>
          ))}
          {'link' in s && s.link && (
            <p>
              <a href={s.link.href} target="_blank" rel="noopener noreferrer">
                {s.link.label}
              </a>
            </p>
          )}
        </section>
      ))}
    </main>
  );
}
