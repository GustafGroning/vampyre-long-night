/**
 * Lokal utvecklingsserver: samma `handleHttp` som edge-funktionen, men med
 * MemoryStore och testkonton i stället för Supabase. Startar med demokampanjen.
 *
 *   npm run dev:server -w @vampyre/server          # http://localhost:8787
 *   VITE_DEV_SERVER_URL=http://localhost:8787 npm run dev
 *
 * Konton (lösenord "vampyre"): gm@dev (plattformsadmin + GM), och en per
 * demospelare: innerCircle@dev, prince@dev, baron@dev, hiddenArchbishop@dev, untitled@dev.
 *
 * Extra endpoints, bara här: POST /dev/login {email, password} → {token, user},
 * POST /dev/signup {email, password} → {token, user} (som självregistrering i Supabase),
 * POST /dev/resolve → löser aktuell rond som GM.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { DEMO_PLAYERS } from '@vampyre/engine';
import { CORS_HEADERS, MemoryStore, cryptoContext, handle, handleHttp, type ServerContext } from '../src/index.js';

const PORT = Number(process.env.PORT ?? 8787);
const PASSWORD = 'vampyre';
const store = new MemoryStore();
const gmId = store.addUser('gm@dev', { platformAdmin: true, password: PASSWORD });
const ctx = (userId: string | null): ServerContext => ({ userId, store, auth: store, ...cryptoContext() });

const { campaignId } = await handle({ op: 'gm_create_campaign', name: 'Demokampanj (lokal)', demo: true }, ctx(gmId));
for (const [key, playerId] of Object.entries(DEMO_PLAYERS)) {
  store.addUser(`${key}@dev`, { password: PASSWORD });
  await handle({ op: 'gm_assign', campaignId, email: `${key}@dev`, role: 'player', playerId }, ctx(gmId));
}

const tokenFor = (userId: string) => `dev-${userId}`;
const userFromToken = async (jwt: string) => {
  const id = jwt.startsWith('dev-') ? jwt.slice(4) : '';
  return store.users.has(id) ? id : null;
};

async function toRequest(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const method = req.method ?? 'GET';
  return new Request(`http://localhost${req.url ?? '/'}`, {
    method,
    headers,
    ...(method === 'GET' || method === 'HEAD' ? {} : { body: Buffer.concat(chunks) }),
  });
}

async function send(res: ServerResponse, r: Response): Promise<void> {
  res.writeHead(r.status, Object.fromEntries(r.headers.entries()));
  res.end(Buffer.from(await r.arrayBuffer()));
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

createServer(async (req, res) => {
  try {
    const request = await toRequest(req);
    const path = new URL(request.url).pathname;
    if (request.method === 'OPTIONS') return send(res, new Response('ok', { headers: CORS_HEADERS }));
    if (path === '/game') {
      return send(res, await handleHttp(request, { userFromToken, context: () => ({ store, auth: store, ...cryptoContext() }), logError: console.error }));
    }
    if (path === '/dev/login') {
      const { email, password } = (await request.json()) as { email?: string; password?: string };
      const id = email ? await store.userIdByEmail(email) : null;
      const user = id ? store.users.get(id) : undefined;
      if (!user || user.password !== password) return send(res, json(401, { error: 'Fel e-post eller lösenord' }));
      return send(res, json(200, { token: tokenFor(user.id), user: { id: user.id, email: user.email } }));
    }
    if (path === '/dev/signup') {
      const { email, password } = (await request.json()) as { email?: string; password?: string };
      if (!email?.includes('@') || !password || password.length < 8) {
        return send(res, json(400, { error: 'ange e-post och ett lösenord på minst 8 tecken' }));
      }
      const id = await store.createUser(email.trim(), password).catch(() => null);
      if (!id) return send(res, json(400, { error: 'e-postadressen finns redan' }));
      return send(res, json(200, { token: tokenFor(id), user: { id, email: email.trim() } }));
    }
    if (path === '/dev/resolve') {
      return send(res, json(200, await handle({ op: 'gm_resolve', campaignId }, ctx(gmId))));
    }
    return send(res, json(404, { error: 'okänd sökväg' }));
  } catch (e) {
    console.error(e);
    return send(res, json(500, { error: (e as Error).message }));
  }
}).listen(PORT, () => {
  console.log(`Spelservern (lokal) på http://localhost:${PORT}, kampanj ${campaignId}`);
});
