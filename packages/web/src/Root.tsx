/**
 * Spelläget: inloggning (eller nytt konto) → startsida → kampanj.
 * Startsidan visar kampanjerna man hör till och kontots vampyrer (P18).
 * Ingen design här heller; bara flödet.
 */
import { useCallback, useEffect, useState } from 'react';
import type { CampaignSummary } from '@vampyre/server/api';
import { App } from './App';
import { CharacterList } from './characters/CharacterList';
import { ApiClientError, type ApiClient } from './server/apiClient';
import type { AuthClient, AuthUser } from './server/auth';
import { loadServerScreen, type LoadedScreen } from './server/serverPort';
import { useRoundWatcher } from './server/useRoundWatcher';

/**
 * Öppen kampanj i den här fliken. sessionStorage: en omladdning stannar i
 * kampanjen, men en ny inloggning eller flik börjar på startsidan.
 */
const OPEN_CAMPAIGN = 'vampyre-open-campaign';

function openedCampaign(): string | null {
  try {
    return sessionStorage.getItem(OPEN_CAMPAIGN);
  } catch {
    return null;
  }
}

function rememberOpen(id: string | null): void {
  try {
    if (id) sessionStorage.setItem(OPEN_CAMPAIGN, id);
    else sessionStorage.removeItem(OPEN_CAMPAIGN);
  } catch {
    // Bara en bekvämlighet.
  }
}

const message = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

/** Supabase kräver minst 6 tecken; vi kräver 8 som admin_create_user. */
export const PASSWORD_MIN = 8;

export const NO_EMAIL_NOTICE =
  'The email server is not running, so remember your password. You cannot reset it!';

export function LoginForm({ auth }: { auth: AuthClient }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signup = mode === 'signup';
  return (
    <form
      className="login"
      aria-label={signup ? 'Create account' : 'Sign in'}
      onSubmit={async (e) => {
        e.preventDefault();
        if (signup) {
          if (password.length < PASSWORD_MIN) return setError(`The password must have at least ${PASSWORD_MIN} characters`);
          if (password !== repeat) return setError('The passwords do not match');
        }
        setBusy(true);
        const res = signup ? await auth.signUp(email, password) : await auth.signIn(email, password);
        setBusy(false);
        setError(res.error);
      }}
    >
      <h1>Vampyre: The Long Night</h1>
      {signup && <p role="note">{NO_EMAIL_NOTICE}</p>}
      <label>
        Email
        <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>
        Password
        <input
          type="password"
          autoComplete={signup ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {signup && (
        <label>
          Repeat password
          <input
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            required
          />
        </label>
      )}
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy}>
        {signup ? 'Create account' : 'Sign in'}
      </button>
      <button
        type="button"
        onClick={() => {
          setMode(signup ? 'login' : 'signup');
          setError(null);
        }}
      >
        {signup ? 'I already have an account' : 'Create account'}
      </button>
    </form>
  );
}

function AccountBar({
  user,
  onHome,
  onSignOut,
}: {
  user: AuthUser;
  /** Satt när man är i en kampanj. */
  onHome: (() => void) | null;
  onSignOut: () => void;
}) {
  return (
    <div className="account-bar">
      <span>{user.email}</span>
      {onHome && (
        <button type="button" onClick={onHome}>
          Home
        </button>
      )}
      <button type="button" onClick={onSignOut}>
        Sign out
      </button>
    </div>
  );
}

/** Startsidan: kampanjer man hör till (bara admin skapar kampanjer) och kontots vampyrer. */
function HomeScreen({
  api,
  campaigns,
  error,
  onOpen,
}: {
  api: ApiClient;
  campaigns: CampaignSummary[] | null;
  error: string | null;
  onOpen: (id: string) => void;
}) {
  return (
    <main className="home">
      <section aria-label="My campaigns">
        <h2>My campaigns</h2>
        {error && <p role="alert">{error}</p>}
        {!campaigns && !error && <p>Loading…</p>}
        {campaigns && campaigns.length === 0 && (
          <p>You are not in any campaign yet. Campaigns are created by the admin, who adds you.</p>
        )}
        {campaigns && campaigns.length > 0 && (
          <ul className="campaign-list">
            {campaigns.map((c) => (
              <li key={c.campaignId}>
                <strong>{c.name}</strong>{' '}
                {c.playerId ? (
                  <button type="button" onClick={() => onOpen(c.campaignId)} aria-label={`Open ${c.name}`}>
                    Open
                  </button>
                ) : (
                  <span>{c.role === 'gm' ? 'GM (no player to show)' : 'No player linked yet'}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <CharacterList api={api} />
    </main>
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
  if (!loaded) return <p>Loading…</p>;
  return (
    <>
      <WatchRound api={api} loaded={loaded} onNewRound={() => setNewRound(true)} onReload={load} />
      {newRound && <p role="status">New round, loading…</p>}
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
        // Bara efter omladdning i samma flik; annars börjar man på startsidan.
        const open = openedCampaign();
        setCampaignId(list.find((c) => c.campaignId === open && c.playerId)?.campaignId ?? null);
      })
      .catch((e: unknown) => {
        if (e instanceof ApiClientError && e.status === 401) void auth.signOut();
        setError(message(e));
      });
  }, [api, auth, user]);

  const open = (id: string | null) => {
    rememberOpen(id);
    setCampaignId(id);
  };

  if (user === undefined) return <p>Loading…</p>;
  if (user === null) return <LoginForm auth={auth} />;

  const bar = (
    <AccountBar
      user={user}
      onHome={campaignId ? () => open(null) : null}
      onSignOut={() => {
        rememberOpen(null);
        void auth.signOut();
      }}
    />
  );
  if (!campaignId) {
    return (
      <>
        {bar}
        <HomeScreen api={api} campaigns={campaigns} error={error} onOpen={open} />
      </>
    );
  }
  return (
    <>
      {bar}
      <ServerScreen api={api} campaignId={campaignId} />
    </>
  );
}
