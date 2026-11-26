/**
 * Inloggning: e-post + lösenord via Supabase Auth. Spelare skapar konto själva
 * (P20); e-postbekräftelse är avstängd i Supabase eftersom ingen SMTP finns,
 * så glömda lösenord kan inte återställas. Admin kan fortfarande skapa konton.
 *
 * `AuthClient` är ett gränssnitt så att den lokala utvecklingsservern
 * (`npm run dev:server -w @vampyre/server`) kan användas utan Supabase.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthClient {
  currentUser(): Promise<AuthUser | null>;
  accessToken(): Promise<string | null>;
  signIn(email: string, password: string): Promise<{ error: string | null }>;
  /** Skapar kontot och loggar in. */
  signUp(email: string, password: string): Promise<{ error: string | null }>;
  signOut(): Promise<void>;
  /** Anropas när användaren loggar in eller ut (även i en annan flik). Returnerar avregistrering. */
  onChange(cb: (user: AuthUser | null) => void): () => void;
}

export function createSupabaseAuth(url: string, anonKey: string): AuthClient {
  const sb: SupabaseClient = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  const toUser = (u: { id: string; email?: string | undefined } | null | undefined): AuthUser | null =>
    u ? { id: u.id, email: u.email ?? '' } : null;
  return {
    async currentUser() {
      const { data } = await sb.auth.getSession();
      return toUser(data.session?.user);
    },
    async accessToken() {
      const { data } = await sb.auth.getSession();
      return data.session?.access_token ?? null;
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      return { error: error ? 'Fel e-post eller lösenord' : null };
    },
    async signUp(email, password) {
      const { data, error } = await sb.auth.signUp({ email: email.trim(), password });
      if (error) return { error: `Kunde inte skapa kontot: ${error.message}` };
      // Utan session kräver Supabase e-postbekräftelse, som inte fungerar utan SMTP.
      if (!data.session) {
        return { error: 'Kontot skapades men kräver e-postbekräftelse, som inte är påslagen. Säg till admin.' };
      }
      return { error: null };
    },
    async signOut() {
      await sb.auth.signOut();
    },
    onChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_event, session) => cb(toUser(session?.user)));
      return () => data.subscription.unsubscribe();
    },
  };
}

/**
 * Inloggning mot den lokala utvecklingsservern. Token sparas i sessionStorage.
 * Bara för utveckling: servern accepterar bara sina egna testkonton.
 */
export function createDevAuth(baseUrl: string): AuthClient {
  const KEY = 'vampyre-dev-token';
  const listeners = new Set<(u: AuthUser | null) => void>();
  const read = (): { token: string; user: AuthUser } | null => {
    try {
      const raw = sessionStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as { token: string; user: AuthUser }) : null;
    } catch {
      return null;
    }
  };
  const write = (v: { token: string; user: AuthUser } | null) => {
    try {
      if (v) sessionStorage.setItem(KEY, JSON.stringify(v));
      else sessionStorage.removeItem(KEY);
    } catch {
      // sessionStorage kan saknas; då gäller inloggningen bara sidan.
    }
    for (const l of listeners) l(v?.user ?? null);
  };
  let memory = read();
  const post = (path: string, body: unknown) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
  return {
    async currentUser() {
      return memory?.user ?? null;
    },
    async accessToken() {
      return memory?.token ?? null;
    },
    async signIn(email, password) {
      const res = await post('/dev/login', { email, password });
      if (!res?.ok) return { error: 'Fel e-post eller lösenord' };
      memory = (await res.json()) as { token: string; user: AuthUser };
      write(memory);
      return { error: null };
    },
    async signUp(email, password) {
      const res = await post('/dev/signup', { email, password });
      if (!res?.ok) {
        const body = (await res?.json().catch(() => null)) as { error?: string } | null;
        return { error: `Kunde inte skapa kontot: ${body?.error ?? 'okänt fel'}` };
      }
      memory = (await res.json()) as { token: string; user: AuthUser };
      write(memory);
      return { error: null };
    },
    async signOut() {
      memory = null;
      write(null);
    },
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
