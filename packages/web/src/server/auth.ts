/**
 * Inloggning (P3): e-post + lösenord via Supabase Auth. Konton skapas av en
 * plattformsadmin (`admin_create_user`), så ingen registrering eller mejl behövs.
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
  return {
    async currentUser() {
      return memory?.user ?? null;
    },
    async accessToken() {
      return memory?.token ?? null;
    },
    async signIn(email, password) {
      const res = await fetch(`${baseUrl}/dev/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }).catch(() => null);
      if (!res?.ok) return { error: 'Fel e-post eller lösenord' };
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
