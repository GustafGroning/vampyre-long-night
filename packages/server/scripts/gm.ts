/**
 * GM-verktyg på kommandoraden tills det finns ett GM-gränssnitt.
 * Loggar in med e-post och lösenord och anropar edge-funktionen `game`.
 *
 *   export VAMPYRE_SUPABASE_URL=https://<ref>.supabase.co
 *   export VAMPYRE_SUPABASE_ANON_KEY=<publishable/anon key>
 *   export VAMPYRE_EMAIL=gm@example.com VAMPYRE_PASSWORD=...
 *   npm run gm -w @vampyre/server -- <kommando> [argument]
 *
 * Kommandon:
 *   campaigns                                  dina kampanjer
 *   create-user <email> <lösenord> [namn]      skapa konto (plattformsadmin)
 *   create-demo <namn> [deadlineHours]         skapa demokampanjen (plattformsadmin)
 *   assign <campaignId> <email> <playerId|gm>  koppla en användare till en spelare
 *   status <campaignId>                        vem har lämnat in och låst
 *   resolve <campaignId> [deadlineHours]       lös ronden och öppna nästa
 *   events <campaignId> [rond]                 hela logen för en löst rond
 */
import type { ApiRequest } from '../src/api.ts';

const env = (k: string): string => {
  const v = process.env[k];
  if (!v) {
    console.error(`Saknar miljövariabeln ${k}`);
    process.exit(2);
  }
  return v;
};

async function signIn(url: string, anonKey: string): Promise<string> {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env('VAMPYRE_EMAIL'), password: env('VAMPYRE_PASSWORD') }),
  });
  const body = (await res.json()) as { access_token?: string; error_description?: string; msg?: string };
  if (!res.ok || !body.access_token) throw new Error(`Inloggningen misslyckades: ${body.error_description ?? body.msg ?? res.status}`);
  return body.access_token;
}

function parse(argv: string[]): ApiRequest {
  const [cmd, a, b, c, d] = argv;
  const num = (v: string | undefined) => (v === undefined ? undefined : Number(v));
  switch (cmd) {
    case 'campaigns':
      return { op: 'campaigns' };
    case 'create-user':
      return { op: 'admin_create_user', email: a!, password: b!, ...(c ? { displayName: c } : {}) };
    case 'create-demo':
      return { op: 'gm_create_campaign', name: a ?? 'Demo', demo: true, ...(b ? { deadlineHours: Number(b) } : {}) };
    case 'assign':
      return c === 'gm'
        ? { op: 'gm_assign', campaignId: a!, email: b!, role: 'gm', playerId: null, ...(d ? { displayName: d } : {}) }
        : { op: 'gm_assign', campaignId: a!, email: b!, role: 'player', playerId: c!, ...(d ? { displayName: d } : {}) };
    case 'status':
      return { op: 'gm_status', campaignId: a! };
    case 'resolve':
      return { op: 'gm_resolve', campaignId: a!, ...(b ? { deadlineHours: Number(b) } : {}) };
    case 'events': {
      const round = num(b);
      return { op: 'gm_events', campaignId: a!, ...(round !== undefined ? { round } : {}) };
    }
    default:
      console.error('Okänt kommando. Se kommentaren överst i scripts/gm.ts.');
      process.exit(2);
  }
}

const url = env('VAMPYRE_SUPABASE_URL').replace(/\/$/, '');
const anonKey = env('VAMPYRE_SUPABASE_ANON_KEY');
const req = parse(process.argv.slice(2));
const token = await signIn(url, anonKey);
const res = await fetch(`${url}/functions/v1/game`, {
  method: 'POST',
  headers: { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(req),
});
console.log(JSON.stringify(await res.json(), null, 2));
if (!res.ok) process.exit(1);
