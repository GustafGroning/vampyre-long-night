import type { VampireSummary } from '../screen/model';

export function VampirePanel({ vampire }: { vampire: VampireSummary }) {
  const s = vampire.stats;
  return (
    <section className="vampire-panel" aria-label="Your vampire">
      <h2 className="vampire-name">{vampire.name}</h2>
      {vampire.titleLabel && <p className="vampire-title">{vampire.titleLabel}</p>}
      <dl className="vampire-stats">
        <div title="Strength">
          <dt>💪<span className="sr-only">Strength</span></dt>
          <dd data-testid="stat-strength">{s.strength}</dd>
        </div>
        <div title="Stealth">
          <dt>🕵<span className="sr-only">Stealth</span></dt>
          <dd data-testid="stat-stealth">{s.stealth}</dd>
        </div>
        <div title="Intercept">
          <dt>👁<span className="sr-only">Intercept</span></dt>
          <dd data-testid="stat-intercept">{s.intercept}</dd>
        </div>
      </dl>
    </section>
  );
}
