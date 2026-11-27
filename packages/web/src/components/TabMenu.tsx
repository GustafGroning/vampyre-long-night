/** Flikmenyn uppe till höger. Bara kartan finns än; övriga är platshållare (namn gissade från mockupen). */
export const TABS = [
  { id: 'map', label: 'Karta', icon: '🗺' },
  { id: 'society', label: 'Vampiric Society', icon: '🏰' },
  { id: 'disciplines', label: 'Discipliner', icon: '🦷' },
  { id: 'titles', label: 'Titlar', icon: '👑' },
  { id: 'history', label: 'Ronder', icon: '⌛' },
  { id: 'chat', label: 'Chatt', icon: '💬' },
  { id: 'news', label: 'Nyheter', icon: '📰' },
  { id: 'artifacts', label: 'Artifacts', icon: '🏺' },
  { id: 'vampire', label: 'Vampyr', icon: '🧛' },
  { id: 'minions', label: 'Minions', icon: '👥' },
  { id: 'cities', label: 'Städer', icon: '🏙' },
] as const;

export type TabId = (typeof TABS)[number]['id'];

export function TabMenu({ active, onSelect }: { active: TabId; onSelect: (t: TabId) => void }) {
  return (
    <nav className="tab-menu" aria-label="Flikar">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={t.id === active ? 'tab active' : 'tab'}
          aria-current={t.id === active ? 'page' : undefined}
          title={t.label}
          onClick={() => onSelect(t.id)}
        >
          <span aria-hidden>{t.icon}</span>
          <span className="sr-only">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
