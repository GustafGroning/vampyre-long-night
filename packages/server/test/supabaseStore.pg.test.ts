/**
 * SupabaseStore mot riktig Postgres med migrationen, genom en liten shim som
 * översätter PostgREST-anrop (`POST /rest/v1/rpc/<fn>`) till `select public.<fn>(arg => …)`.
 * Fångar fel i funktionsnamn, argumentnamn och returformat mellan TS och SQL.
 *
 * Körs bara när GAME_TEST_PG_URL är satt (Postgres med stubben och migrationerna,
 * se supabase/tests/run.sh). Annars hoppas den över.
 */
import { describe, expect, it } from 'vitest';
import { DEMO_PLAYERS } from '@vampyre/engine';
import { handle, SupabaseStore, type ApiRequest, type ApiResponses, type ServerContext } from '../src/index.js';

const PG_URL = process.env.GAME_TEST_PG_URL;

describe.skipIf(!PG_URL)('SupabaseStore mot Postgres', () => {
  it('hela flödet: skapa, koppla, lämna in, lös, ny rond', async () => {
    const { default: pg } = await import('pg');
    const db = new pg.Client({ connectionString: PG_URL });
    await db.connect();
    try {
      const shim: typeof fetch = async (input, init) => {
        const url = String(input);
        const m = /\/rest\/v1\/rpc\/(\w+)$/.exec(url);
        if (!m) return new Response('{"msg":"okänd url"}', { status: 404 });
        const args = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        const names = Object.keys(args);
        const params = names.map((n) => {
          const v = args[n];
          return v === null || v === undefined ? null : typeof v === 'object' ? JSON.stringify(v) : v;
        });
        const call = `public.${m[1]}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')})`;
        try {
          await db.query('set role service_role');
          const r = await db.query(`select to_jsonb(x) as r from (select ${call} as x) t`, params).catch(async (e: Error) => {
            if (!/void/.test(e.message)) throw e;
            await db.query(`select ${call}`, params);
            return { rows: [{ r: null }] };
          });
          const value = r.rows[0]?.r ?? null;
          return new Response(value === null ? '' : JSON.stringify(value), { status: 200 });
        } catch (e) {
          return new Response(JSON.stringify({ message: (e as Error).message }), { status: 400 });
        } finally {
          await db.query('reset role');
        }
      };
      const store = new SupabaseStore({ url: 'http://pg', serviceRoleKey: 'k', fetch: shim });

      const ids = { admin: crypto.randomUUID(), prince: crypto.randomUUID() };
      const tag = Date.now();
      await db.query('insert into auth.users (id, email) values ($1, $2), ($3, $4)', [
        ids.admin, `admin-${tag}@example.test`, ids.prince, `prince-${tag}@example.test`,
      ]);
      await db.query(`insert into public.user_roles (user_id, role) values ($1, 'platform_admin')`, [ids.admin]);

      let clock = Date.now();
      const ctx = (userId: string): ServerContext => ({
        userId,
        store,
        auth: store,
        now: () => clock,
        randomSeed: () => crypto.randomUUID(),
        newId: () => crypto.randomUUID(),
      });
      const as =
        (u: string) =>
        <K extends ApiRequest['op']>(req: Extract<ApiRequest, { op: K }>): Promise<ApiResponses[K]> =>
          handle(req, ctx(u));
      const gm = as(ids.admin);
      const prince = as(ids.prince);

      const { campaignId } = await gm({ op: 'gm_create_campaign', name: 'PG-test', demo: true });
      await gm({ op: 'gm_assign', campaignId, email: `PRINCE-${tag}@example.test`, role: 'player', playerId: DEMO_PLAYERS.prince });
      expect(await prince({ op: 'campaigns' })).toEqual([{ campaignId, name: 'PG-test', role: 'player', playerId: DEMO_PLAYERS.prince }]);

      const s1 = await prince({ op: 'screen', campaignId });
      expect(s1.round).toBe(1);
      expect(s1.submission).toBeNull();

      const bleed = { actionId: 'bleed', performer: { kind: 'vampire' as const }, key: 'd1' };
      expect(await prince({ op: 'submit', campaignId, round: 1, actions: [bleed], royalPrivilegesToSpend: 1 })).toEqual({ ok: true });
      expect((await prince({ op: 'screen', campaignId })).submission).toMatchObject({ actions: [bleed], royalPrivilegesToSpend: 1, locked: true });
      await prince({ op: 'unlock', campaignId, round: 1 });
      expect((await prince({ op: 'screen', campaignId })).submission?.locked).toBe(false);

      const st = await gm({ op: 'gm_status', campaignId });
      expect(st.players.find((p) => p.playerId === DEMO_PLAYERS.prince)).toMatchObject({ assigned: true, submitted: true, locked: false });

      clock += 1000;
      expect(await gm({ op: 'gm_resolve', campaignId })).toMatchObject({ status: 'resolved', round: 1, nextRound: 2 });
      expect(await prince({ op: 'status', campaignId })).toEqual({ round: 2, phase: 'submission', windowStatus: 'open' });
      const s2 = await prince({ op: 'screen', campaignId });
      expect(s2.submission).toBeNull();
      expect(s2.view.events.length).toBeGreaterThan(0);
      expect((await gm({ op: 'gm_events', campaignId })).events.length).toBeGreaterThan(0);

      // Spelaren kan inte läsa speltabellerna direkt.
      await db.query('set role authenticated');
      await expect(db.query('select * from public.game_rounds')).rejects.toThrow(/permission denied/);
      await db.query('reset role');
    } finally {
      await db.end();
    }
  });
});
