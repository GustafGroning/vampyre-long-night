/**
 * Klient mot spelserverns edge function `game`. Varje anrop skickar användarens
 * JWT; servern avgör vilken spelare man är (aldrig klienten).
 */
import type { ApiErrorBody, ApiRequest, ApiResponses } from '@vampyre/server/api';

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface ApiClient {
  call<K extends ApiRequest['op']>(req: Extract<ApiRequest, { op: K }>): Promise<ApiResponses[K]>;
}

export interface ApiClientOptions {
  /** T.ex. https://<ref>.supabase.co/functions/v1/game */
  endpoint: string;
  /** Supabase publishable/anon-nyckel (inte hemlig). Krävs av Supabase-gatewayen. */
  apiKey?: string;
  accessToken: () => Promise<string | null>;
  fetch?: typeof fetch;
}

export function createApiClient(opts: ApiClientOptions): ApiClient {
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  return {
    async call(req) {
      const token = await opts.accessToken();
      if (!token) throw new ApiClientError(401, 'unauthenticated', 'Du är inte inloggad');
      let res: Response;
      try {
        res = await doFetch(opts.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            ...(opts.apiKey ? { apikey: opts.apiKey } : {}),
          },
          body: JSON.stringify(req),
        });
      } catch {
        throw new ApiClientError(0, 'network', 'Kunde inte nå servern');
      }
      const body = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        const err = (body as ApiErrorBody | null)?.error;
        throw new ApiClientError(res.status, err?.code ?? 'internal', err?.message ?? `Serverfel (${res.status})`);
      }
      return body as never;
    },
  };
}
