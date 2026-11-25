import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Root } from './Root';
import { createApiClient } from './server/apiClient';
import { createDevAuth, createSupabaseAuth } from './server/auth';
import { createDemoPort, isDemoPlayerKey } from './screen/demo';
import './styles.css';

/**
 * Tre lägen (se packages/web/README.md):
 * - Spel: VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY satta. Inloggning och server.
 * - Lokal server: VITE_DEV_SERVER_URL satt (npm run dev:server -w @vampyre/server).
 * - Demo: annars, eller med ?demo. Demokampanjen körs i webbläsaren; ?player= väljer spelare.
 */
const params = new URLSearchParams(window.location.search);
const env = import.meta.env;
const supabaseUrl = env.VITE_SUPABASE_URL as string | undefined;
const anonKey = env.VITE_SUPABASE_ANON_KEY as string | undefined;
const devServer = env.VITE_DEV_SERVER_URL as string | undefined;

function root(): ReactNode {
  if (!params.has('demo')) {
    if (supabaseUrl && anonKey) {
      const auth = createSupabaseAuth(supabaseUrl, anonKey);
      const api = createApiClient({
        endpoint: `${supabaseUrl.replace(/\/$/, '')}/functions/v1/game`,
        apiKey: anonKey,
        accessToken: () => auth.accessToken(),
      });
      return <Root auth={auth} api={api} />;
    }
    if (devServer) {
      const auth = createDevAuth(devServer);
      const api = createApiClient({ endpoint: `${devServer}/game`, accessToken: () => auth.accessToken() });
      return <Root auth={auth} api={api} />;
    }
  }
  const key = params.get('player');
  return <App port={createDemoPort(isDemoPlayerKey(key) ? key : 'prince')} />;
}

createRoot(document.getElementById('app')!).render(<StrictMode>{root()}</StrictMode>);
