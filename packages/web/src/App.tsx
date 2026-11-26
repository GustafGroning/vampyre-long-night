import { useMemo, useState } from 'react';
import { ActionPanel } from './components/ActionPanel';
import { GameMap } from './components/GameMap';
import { ResourceBar } from './components/ResourceBar';
import { TABS, TabMenu, type TabId } from './components/TabMenu';
import { VampirePanel } from './components/VampirePanel';
import type { PlayerScreenPort } from './screen/model';

export function App({ port }: { port: PlayerScreenPort }) {
  const data = useMemo(() => port.load(), [port]);
  const [tab, setTab] = useState<TabId>('map');
  const tabLabel = TABS.find((t) => t.id === tab)?.label ?? '';

  return (
    <div className="main-screen">
      <header className="top-bar">
        <ResourceBar resources={data.resources} />
      </header>
      <main className="main-area">
        {tab === 'map' ? (
          <GameMap map={data.map} round={data.round} />
        ) : (
          <div className="placeholder">
            <h2>{tabLabel}</h2>
            <p>This tab is not built yet.</p>
          </div>
        )}
      </main>
      <aside className="side-panel">
        <TabMenu active={tab} onSelect={setTab} />
        <VampirePanel vampire={data.vampire} />
        <ActionPanel port={port} round={data.round.round} />
      </aside>
    </div>
  );
}
