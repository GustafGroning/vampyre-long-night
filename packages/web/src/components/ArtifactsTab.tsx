import { useState } from 'react';
import type { ArtifactEntry } from '../screen/model';

/**
 * Artifacts-fliken: alla artefakter i kampanjen och vem som har dem, bara om
 * spelaren garanterat vet det. Klick visar vad artefakten gör.
 */
export function ArtifactsTab({ artifacts }: { artifacts: ArtifactEntry[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const current = artifacts.find((a) => a.key === selected) ?? null;

  return (
    <section className="artifacts-tab" aria-label="Artifacts">
      <div className="artifact-list-wrap">
        <h2>Artifacts</h2>
        <p className="artifact-hint">
          You only see who holds an artifact when you know it: your own, or ones revealed by actions such as Look for
          Artifacts or seeing someone use one.
        </p>
        <ul className="artifact-list">
          {artifacts.map((a) => {
            const own = a.owners.some((o) => o.own);
            return (
              <li key={a.key}>
                <button
                  type="button"
                  className={['artifact-row', own ? 'own' : '', a.key === selected ? 'selected' : ''].filter(Boolean).join(' ')}
                  aria-pressed={a.key === selected}
                  onClick={() => setSelected(a.key === selected ? null : a.key)}
                >
                  <span className="artifact-name">{a.name}</span>
                  <span className={a.owners.length ? 'artifact-owner' : 'artifact-owner unknown'} data-testid={`owner-${a.key}`}>
                    {a.owners.length ? a.owners.map((o) => o.label).join(', ') : 'Unknown'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      {current && <ArtifactDetails artifact={current} onClose={() => setSelected(null)} />}
    </section>
  );
}

function ArtifactDetails({ artifact: a, onClose }: { artifact: ArtifactEntry; onClose: () => void }) {
  return (
    <article className="artifact-details" aria-label={`${a.name} details`}>
      <header>
        <h3>{a.name}</h3>
        <button type="button" className="link-button" onClick={onClose}>
          Close
        </button>
      </header>
      <p className="artifact-text">{a.text}</p>
      <dl className="artifact-facts">
        <dt>Cost</dt>
        <dd>{a.cost}</dd>
        <dt>Stealth</dt>
        <dd>{a.stealth}</dd>
        <dt>Carried by a minion</dt>
        <dd>{a.minionBonus ?? 'Minions get no bonus from it'}</dd>
        <dt>Rules</dt>
        <dd>{a.notes.join(' · ')}</dd>
        <dt>Held by</dt>
        <dd>
          {a.owners.length === 0 ? (
            'Unknown'
          ) : (
            <ul className="artifact-owners">
              {a.owners.map((o, i) => (
                <li key={i}>
                  <strong>{o.label}</strong> <span className="artifact-how">({o.how})</span>
                </li>
              ))}
            </ul>
          )}
        </dd>
      </dl>
    </article>
  );
}
