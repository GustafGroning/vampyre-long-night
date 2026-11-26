/**
 * HTTP-lagret: Request in, Response ut. Används av edge-funktionen (Deno) och
 * av den lokala utvecklingsservern (Node); båda har webbstandardens Request/Response.
 */
import type { ApiErrorBody, ApiRequest } from './api.js';
import { ApiError, handle, type ServerContext } from './handle.js';

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function errorBody(code: ApiErrorBody['error']['code'], message: string): ApiErrorBody {
  return { error: { code, message } };
}

export interface HttpDeps {
  /** Användar-id ur Authorization-headerns JWT, eller null. */
  userFromToken: (jwt: string) => Promise<string | null>;
  context: (userId: string | null) => Omit<ServerContext, 'userId'>;
  /** Loggning av oväntade fel. Skickar aldrig detaljer till klienten. */
  logError?: (e: unknown) => void;
}

export async function handleHttp(request: Request, deps: HttpDeps): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (request.method !== 'POST') return json(405, errorBody('bad_request', 'Only POST'));

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, errorBody('bad_request', 'Invalid JSON'));
  }

  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const userId = token ? await deps.userFromToken(token) : null;

  try {
    const result = await handle(body as ApiRequest, { ...deps.context(userId), userId });
    return json(200, result);
  } catch (e) {
    if (e instanceof ApiError) return json(e.status, errorBody(e.code, e.message));
    deps.logError?.(e);
    return json(500, errorBody('internal', 'Server error'));
  }
}
