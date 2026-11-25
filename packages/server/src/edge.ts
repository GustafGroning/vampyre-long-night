/**
 * Ingång för Supabase edge function `game`. Bundlas med motorn till
 * `supabase/functions/game/index.js` (`npm run build:function -w @vampyre/server`).
 *
 * Miljö (sätts av Supabase automatiskt): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import { handleHttp } from './http.js';
import { cryptoContext } from './runtime.js';
import { SupabaseStore } from './supabaseStore.js';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const url = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !serviceRoleKey) throw new Error('SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY måste vara satta');

const store = new SupabaseStore({ url, serviceRoleKey });

Deno.serve((req) =>
  handleHttp(req, {
    userFromToken: (jwt) => store.userFromToken(jwt),
    context: () => ({ store, auth: store, ...cryptoContext() }),
    logError: (e) => console.error(e),
  }),
);
