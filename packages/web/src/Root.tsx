/**
 * Spelläget: inloggning → kampanj → huvudskärmen från servern.
 * Ingen design här heller; bara flödet.
 */
import { useCallback, useEffect, useState } from 'react';
import type { CampaignSummary } from '@vampyre/server/api';
import { App } from './App';
import { ApiClientError, type ApiClient } from './server/apiClient';
import type { AuthClient, AuthUser } from './server/auth';
import { loadServerScreen, type LoadedScreen } from './server/serverPort';
import { useRoundWatcher } from './server/useRoundWatcher';

const LAST_CAMPAIGN = 'vampyre-last-campaign';

function remembered(): string | null {
  try {
    return localStorage.getItem(LAST_CAMPAIGN);
  } catch {
    return null;
  }
}

function remember(id: string): void {
  try {
    localStorage.setItem(LAST_CAMPAIGN, id);
  } catch {
    // Bara en bekvämlighet.
  }
}

const message = (e: unknown) => (e instanceof Error ? e.message : 'Något gick fel');

export function LoginForm({ auth }: { auth: AuthClient }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="login"
      aria-label="Logga in"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await auth.signIn(email, password);
        setBusy(false);
        setError(res.error);
      }}
    >
      <h1>Vampyre: The Long Night</h1>
      <label>
        E-post
        <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>
        Lösenord
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy}>
        Logga in
      </button>
    </form>
  );
}

function AccountBar({
  user,
  campaigns,
  campaignId,
  onPick,
  onSignOut,
}: {
  user: AuthUser;
  campaigns: CampaignSummary[];
  campaignId: string | null;
  onPick: (id: string) => void;
  onSignOut: () => void;
}) {
  const playable = campaigns.filter((c) => c.playerId);
  return (
    <div className="account-bar">
      <span>{user.email}</span>
      {playable.length > 1 && (
        <select aria-label="Kampanj" value={campaignId ?? ''} onChange={(e) => onPick(e.target.value)}>
          {playable.map((c) => (
            <option key={c.campaignId} value={c.campaignId}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      <button type="button" onClick={onSignOut}>
        Logga ut
      </button>
    </div>
  );
}

/** Laddar skärmen, och laddar om den när ronden har bytts. */
function ServerScreen({ api, campaignId }: { api: ApiClient; campaignId: string }) {
  const [loaded, setLoaded] = useState<LoadedScreen | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newRound, setNewRound] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoaded(await loadServerScreen(api, campaignId));
      setError(null);
      setNewRound(false);
    } catch (e) {
      setError(message(e));
    }
  }, [api, campaignId]);

  useEffect(() => {
    setLoaded(null);
    void load();
  }, [load]);

  if (error && !loaded) return <p role="alert">{error}</p>;
  if (!loaded) return <p>Laddar…</p>;
  return (
    <>
      <WatchRound api={api} loaded={loaded} onNewRound={() => setNewRound(true)} onReload={load} />
      {newRound && <p role="status">Ny rond, laddar…</p>}
      {/* key: ny rond = ny skärm, så listan och panelens state nollställs. */}
      <App key={`${loaded.screen.campaignId}:${loaded.screen.round}:${loaded.screen.phase}`} port={loaded.port} />
    </>
  );
}

function WatchRound({
  api,
  loaded,
  onNewRound,
  onReload,
}: {
  api: ApiClient;
  loaded: LoadedScreen;
  onNewRound: () => void;
  onReload: () => Promise<void>;
}) {
  const s = loaded.screen;
  useRoundWatcher(api, s.campaignId, { round: s.round, phase: s.phase, windowStatus: s.window.status }, () => {
    onNewRound();
    void onReload();
  });
  return null;
}

export function Root({ auth, api }: { auth: AuthClient; api: ApiClient }) {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void auth.currentUser().then(setUser);
    return auth.onChange(setUser);
  }, [auth]);

  useEffect(() => {
    setCampaigns(null);
    setCampaignId(null);
    setError(null);
    if (!user) return;
    api
      .call({ op: 'campaigns' })
      .then((list) => {
        setCampaigns(list);
        const playable = list.filter((c) => c.playerId);
        const last = remembered();
        setCampaignId(playable.find((c) => c.campaignId === last)?.campaignId ?? playable[0]?.campaignId ?? null);
      })
      .catch((e: unknown) => {
        if (e instanceof ApiClientError && e.status === 401) void auth.signOut();
        setError(message(e));
      });
  }, [api, auth, user]);

  if (user === undefined) return <p>Laddar…</p>;
  if (user === null) return <LoginForm auth={auth} />;

  const bar = (
    <AccountBar
      user={user}
      campaigns={campaigns ?? []}
      campaignId={campaignId}
      onPick={(id) => {
        remember(id);
        setCampaignId(id);
      }}
      onSignOut={() => void auth.signOut()}
    />
  );
  if (error) return (<>{bar}<p role="alert">{error}</p></>);
  if (!campaigns) return (<>{bar}<p>Laddar…</p></>);
  if (!campaignId) return (<>{bar}<p>Du har ingen spelare i någon kampanj än. Be GM att koppla ditt konto.</p></>);
  return (
    <>
      {bar}
      <ServerScreen api={api} campaignId={campaignId} />
    </>
  );
}
