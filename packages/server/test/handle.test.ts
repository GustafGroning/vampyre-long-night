import { describe, expect, it } from 'vitest';
import { DEMO_PLAYERS, type SubmittedAction } from '@vampyre/engine';
import { ApiError, MemoryStore, handle, handleHttp, type ApiRequest, type ApiResponses, type ServerContext } from '../src/index.js';

const HOUR = 3_600_000;

function setup() {
  const store = new MemoryStore();
  const admin = store.addUser('gm@example.test', { platformAdmin: true });
  const prince = store.addUser('prince@example.test');
  const baron = store.addUser('baron@example.test');
  const stranger = store.addUser('stranger@example.test');
  let clock = 1_000_000;
  let n = 0;
  const ctx = (userId: string | null): ServerContext => ({
    userId,
    store,
    auth: store,
    now: () => clock,
    randomSeed: () => `seed-${++n}`,
    newId: () => `campaign-${++n}`,
  });
  const as =
    (userId: string | null) =>
    <K extends ApiRequest['op']>(req: Extract<ApiRequest, { op: K }>): Promise<ApiResponses[K]> =>
      handle(req, ctx(userId));
  return {
    store,
    users: { admin, prince, baron, stranger },
    as,
    tick: (ms: number) => (clock += ms),
    now: () => clock,
  };
}

async function demoCampaign() {
  const t = setup();
  const gm = t.as(t.users.admin);
  const created = await gm({ op: 'gm_create_campaign', name: 'Demo', demo: true, deadlineHours: 48 });
  await gm({ op: 'gm_assign', campaignId: created.campaignId, email: 'PRINCE@example.test ', role: 'player', playerId: DEMO_PLAYERS.prince });
  await gm({ op: 'gm_assign', campaignId: created.campaignId, email: 'baron@example.test', role: 'player', playerId: DEMO_PLAYERS.baron });
  return { ...t, campaignId: created.campaignId, created };
}

const bleed: SubmittedAction = { actionId: 'bleed', performer: { kind: 'vampire' }, key: 'd1' };

async function rejects(p: Promise<unknown>, status: number): Promise<ApiError> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(ApiError);
  expect((e as ApiError).status).toBe(status);
  return e as ApiError;
}

describe('kampanj och medlemmar', () => {
  it('admin skapar demokampanjen i rond 1 med öppen inlämning', async () => {
    const { created, as, users, campaignId } = await demoCampaign();
    expect(created.players.map((p) => p.playerId)).toContain(DEMO_PLAYERS.prince);
    expect(await as(users.prince)({ op: 'campaigns' })).toEqual([
      { campaignId, name: 'Demo', role: 'player', playerId: DEMO_PLAYERS.prince },
    ]);
    expect(await as(users.prince)({ op: 'status', campaignId })).toEqual({ round: 1, phase: 'submission', windowStatus: 'open' });
  });

  it('bara plattformsadmin skapar kampanjer, bara GM kopplar spelare', async () => {
    const { as, users, campaignId } = await demoCampaign();
    await rejects(as(users.prince)({ op: 'gm_create_campaign', name: 'x', demo: true }), 403);
    await rejects(
      as(users.prince)({ op: 'gm_assign', campaignId, email: 'stranger@example.test', role: 'gm' }),
      403,
    );
    await rejects(as(null)({ op: 'campaigns' }), 401);
  });

  it('icke-medlem får samma svar som för en kampanj som inte finns', async () => {
    const { as, users, campaignId } = await demoCampaign();
    const a = await rejects(as(users.stranger)({ op: 'screen', campaignId }), 404);
    const b = await rejects(as(users.stranger)({ op: 'screen', campaignId: 'finns-inte' }), 404);
    expect(a.message).toBe(b.message);
  });

  it('en spelare kan bara ha en användare', async () => {
    const { as, users, campaignId, store } = await demoCampaign();
    await as(users.admin)({ op: 'gm_assign', campaignId, email: 'stranger@example.test', role: 'player', playerId: DEMO_PLAYERS.prince });
    expect((await store.membership(campaignId, users.prince))?.playerId).toBeNull();
    await rejects(as(users.prince)({ op: 'screen', campaignId }), 403);
  });

  it('okänd spelare och okänd e-post avvisas', async () => {
    const { as, users, campaignId } = await demoCampaign();
    await rejects(as(users.admin)({ op: 'gm_assign', campaignId, email: 'prince@example.test', role: 'player', playerId: 'player-99' }), 400);
    await rejects(as(users.admin)({ op: 'gm_assign', campaignId, email: 'nobody@example.test', role: 'player', playerId: 'player-1' }), 404);
  });
});

describe('skärmen', () => {
  it('ger spelarens egen vy och ingen lista före inlämning', async () => {
    const { as, users, campaignId } = await demoCampaign();
    const s = await as(users.prince)({ op: 'screen', campaignId });
    expect(s.round).toBe(1);
    expect(s.view.me.name).toBe('Prince Edmund Hale');
    expect(s.window.status).toBe('open');
    expect(s.submission).toBeNull();
  });

  it('läcker inte seed eller andras state', async () => {
    const { as, users, campaignId, store } = await demoCampaign();
    const s = await as(users.prince)({ op: 'screen', campaignId });
    const raw = JSON.stringify(s);
    const game = (await store.load(campaignId))!;
    expect(raw).not.toContain(game.round.seed);
    expect(raw).not.toContain(game.state.seed);
    // Den dolda Archbishopens sanna sekt syns inte för Prince.
    const archbishop = s.view.players.find((p) => p.id === DEMO_PLAYERS.hiddenArchbishop)!;
    expect(JSON.stringify(archbishop)).not.toContain('sabbat');
    expect(raw).not.toContain('"faction":"sabbat"');
  });

  it('GM utan spelare får ingen spelarskärm', async () => {
    const { as, users, campaignId } = await demoCampaign();
    await rejects(as(users.admin)({ op: 'screen', campaignId }), 403);
  });
});

describe('inlämning', () => {
  it('confirm sparar och låser; listan finns kvar vid nästa laddning', async () => {
    const { as, users, campaignId } = await demoCampaign();
    const p = as(users.prince);
    expect(await p({ op: 'submit', campaignId, round: 1, actions: [bleed], royalPrivilegesToSpend: 1 })).toEqual({ ok: true });
    const s = await p({ op: 'screen', campaignId });
    expect(s.submission).toMatchObject({ actions: [bleed], royalPrivilegesToSpend: 1, locked: true });
  });

  it('unlock låser upp men behåller listan', async () => {
    const { as, users, campaignId } = await demoCampaign();
    const p = as(users.prince);
    await p({ op: 'submit', campaignId, round: 1, actions: [bleed], royalPrivilegesToSpend: 0 });
    expect(await p({ op: 'unlock', campaignId, round: 1 })).toEqual({ ok: true });
    expect((await p({ op: 'screen', campaignId })).submission).toMatchObject({ actions: [bleed], locked: false });
  });

  it('ogiltig lista avvisas helt och sparas inte', async () => {
    const { as, users, campaignId } = await demoCampaign();
    const p = as(users.prince);
    const tooMany = Array.from({ length: 9 }, (_, i) => ({ ...bleed, key: `k${i}` }));
    const res = await p({ op: 'submit', campaignId, round: 1, actions: tooMany, royalPrivilegesToSpend: 0 });
    expect(res.ok).toBe(false);
    expect((await p({ op: 'screen', campaignId })).submission).toBeNull();
  });

  it('skräp i indata avvisas med 400, okända fält tas bort', async () => {
    const { as, users, campaignId, store } = await demoCampaign();
    const p = as(users.prince);
    await rejects(p({ op: 'submit', campaignId, round: 1, actions: 'x' as never, royalPrivilegesToSpend: 0 }), 400);
    await rejects(
      p({ op: 'submit', campaignId, round: 1, actions: [{ actionId: 'bleed', performer: { kind: 'boss' } } as never], royalPrivilegesToSpend: 0 }),
      400,
    );
    await rejects(p({ op: 'submit', campaignId, round: 1, actions: [], royalPrivilegesToSpend: -1 }), 400);
    await p({ op: 'submit', campaignId, round: 1, actions: [{ ...bleed, evil: true } as never], royalPrivilegesToSpend: 0 });
    const saved = (await store.listSubmissions(campaignId, 1))[DEMO_PLAYERS.prince]!;
    expect(saved.actions[0]).toEqual(bleed);
  });

  it('fel rond ger 409, efter deadline nekas inlämning', async () => {
    const { as, users, campaignId, tick } = await demoCampaign();
    const p = as(users.prince);
    await rejects(p({ op: 'submit', campaignId, round: 2, actions: [], royalPrivilegesToSpend: 0 }), 409);
    tick(49 * HOUR);
    const res = await p({ op: 'submit', campaignId, round: 1, actions: [bleed], royalPrivilegesToSpend: 0 });
    expect(res).toEqual({ ok: false, errors: ['Deadline har passerat'] });
  });

  it('spelaren kan bara lämna in för sin egen spelare', async () => {
    const { as, users, campaignId, store } = await demoCampaign();
    await as(users.baron)({ op: 'submit', campaignId, round: 1, actions: [bleed], royalPrivilegesToSpend: 0 });
    const subs = await store.listSubmissions(campaignId, 1);
    expect(Object.keys(subs)).toEqual([DEMO_PLAYERS.baron]);
    // Prince ser inte Barons lista.
    expect((await as(users.prince)({ op: 'screen', campaignId })).submission).toBeNull();
  });
});

describe('upplösning och ny rond', () => {
  it('GM löser ronden; spelaren får rond 2 med ny vy och tom lista', async () => {
    const { as, users, campaignId, now } = await demoCampaign();
    const p = as(users.prince);
    await p({ op: 'submit', campaignId, round: 1, actions: [bleed], royalPrivilegesToSpend: 0 });
    const before = await as(users.admin)({ op: 'gm_status', campaignId });
    expect(before.players.find((x) => x.playerId === DEMO_PLAYERS.prince)).toMatchObject({ assigned: true, submitted: true, locked: true });
    expect(before.players.find((x) => x.playerId === DEMO_PLAYERS.innerCircle)).toMatchObject({ assigned: false, submitted: false });

    const r = await as(users.admin)({ op: 'gm_resolve', campaignId, deadlineHours: 24 });
    expect(r).toMatchObject({ status: 'resolved', round: 1, nextRound: 2 });

    expect(await p({ op: 'status', campaignId })).toEqual({ round: 2, phase: 'submission', windowStatus: 'open' });
    const s = await p({ op: 'screen', campaignId });
    expect(s.round).toBe(2);
    expect(s.submission).toBeNull();
    expect(s.window.deadline).toBe(now() + 24 * HOUR);
    // 100 − 20 bleed − 20 upkeep + 25 stadsinkomst + bleed-inkomst: blood har ändrats av upplösningen.
    expect(s.view.resources.blood).not.toBe(100);
    // Förra rondens events når vyn (Bleed syns i egen ronduppdatering).
    expect(s.view.events.length).toBeGreaterThan(0);
  });

  it('ronden kan inte lösas två gånger, och inlämning nekas när den är stängd', async () => {
    const { as, users, campaignId, store } = await demoCampaign();
    await store.closeRound(campaignId, 1);
    await rejects(as(users.admin)({ op: 'gm_resolve', campaignId }), 409);
    const res = await as(users.prince)({ op: 'submit', campaignId, round: 1, actions: [bleed], royalPrivilegesToSpend: 0 });
    expect(res.ok).toBe(false);
    await rejects(as(users.prince)({ op: 'unlock', campaignId, round: 1 }), 409);
  });

  it('upplösningen är deterministisk: samma seed och listor ger samma state', async () => {
    const a = await demoCampaign();
    const b = await demoCampaign();
    for (const t of [a, b]) {
      await t.as(t.users.prince)({ op: 'submit', campaignId: t.campaignId, round: 1, actions: [bleed], royalPrivilegesToSpend: 0 });
      await t.as(t.users.admin)({ op: 'gm_resolve', campaignId: t.campaignId });
    }
    const sa = (await a.store.load(a.campaignId))!.state;
    const sb = (await b.store.load(b.campaignId))!.state;
    expect(JSON.stringify(sa)).toBe(JSON.stringify(sb));
  });

  it('misslyckad commit öppnar ronden igen', async () => {
    const { as, users, campaignId, store } = await demoCampaign();
    store.commitRound = async () => false;
    await rejects(as(users.admin)({ op: 'gm_resolve', campaignId }), 409);
    expect((await store.load(campaignId))!.round.status).toBe('open');
  });

  it('gm_events ger hela logen bara till GM', async () => {
    const { as, users, campaignId } = await demoCampaign();
    await as(users.admin)({ op: 'gm_resolve', campaignId });
    const e = await as(users.admin)({ op: 'gm_events', campaignId });
    expect(e.round).toBe(1);
    expect(e.events.length).toBeGreaterThan(0);
    await rejects(as(users.prince)({ op: 'gm_events', campaignId }), 403);
  });
});

describe('användare', () => {
  it('admin skapar konton med lösenord', async () => {
    const { as, users, store } = setup();
    const { userId } = await as(users.admin)({ op: 'admin_create_user', email: 'new@example.test', password: 'hemligt123' });
    expect(await store.userIdByEmail('new@example.test')).toBe(userId);
    await rejects(as(users.admin)({ op: 'admin_create_user', email: 'x@example.test', password: 'kort' }), 400);
    await rejects(as(users.prince)({ op: 'admin_create_user', email: 'y@example.test', password: 'hemligt123' }), 403);
  });
});

describe('HTTP', () => {
  it('JWT avgör användaren; fel blir JSON med status', async () => {
    const t = await demoCampaign();
    const deps = {
      userFromToken: async (jwt: string) => (jwt === 'prince-token' ? t.users.prince : null),
      context: () => ({ store: t.store, auth: t.store, now: t.now, randomSeed: () => 's', newId: () => 'id' }),
    };
    const call = (body: unknown, token?: string) =>
      handleHttp(
        new Request('http://x/game', {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: JSON.stringify(body),
        }),
        deps,
      );
    const ok = await call({ op: 'status', campaignId: t.campaignId }, 'prince-token');
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ round: 1, phase: 'submission', windowStatus: 'open' });
    const anon = await call({ op: 'status', campaignId: t.campaignId });
    expect(anon.status).toBe(401);
    expect(await anon.json()).toEqual({ error: { code: 'unauthenticated', message: 'Du är inte inloggad' } });
    expect((await call({ op: 'nope' }, 'prince-token')).status).toBe(400);
    expect((await handleHttp(new Request('http://x/game', { method: 'OPTIONS' }), deps)).headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('oväntade fel läcker inga detaljer', async () => {
    const t = await demoCampaign();
    const logged: unknown[] = [];
    const res = await handleHttp(
      new Request('http://x/game', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: '{"op":"campaigns"}' }),
      {
        userFromToken: async () => t.users.prince,
        context: () => ({
          store: { ...t.store, userCampaigns: async () => { throw new Error('hemlig detalj'); } } as never,
          auth: t.store,
          now: t.now,
          randomSeed: () => 's',
          newId: () => 'id',
        }),
        logError: (e) => logged.push(e),
      },
    );
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('hemlig');
    expect(logged).toHaveLength(1);
  });
});
