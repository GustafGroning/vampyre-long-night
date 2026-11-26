/** Flikmenyn uppe till höger. Bara kartan finns än; övriga är platshållare (namn gissade från mockupen). */
export const TABS = [
  { id: 'map', label: 'Map', icon: '🗺' },
  { id: 'society', label: 'Vampiric Society', icon: '🏰' },
  { id: 'disciplines', label: 'Disciplines', icon: '🦷' },
  { id: 'titles', label: 'Titles', icon: '👑' },
  { id: 'history', label: 'Rounds', icon: '⌛' },
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'news', label: 'News', icon: '📰' },
  { id: 'artifacts', label: 'Artifacts', icon: '🏺' },
  { id: 'vampire', label: 'Vampire', icon: '🧛' },
  { id: 'minions', label: 'Minions', icon: '👥' },
  { id: 'cities', label: 'Cities', icon: '🏙' },
] as const;

export type TabId = (typeof TABS)[number]['id'];

export function TabMenu({ active, onSelect }: { active: TabId; onSelect: (t: TabId) => void }) {
  return (
    <nav className="tab-menu" aria-label="Tabs">
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
