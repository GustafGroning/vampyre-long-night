/**
 * Serverläget mot den riktiga serverlogiken (`handle` + MemoryStore), utan HTTP:
 * inloggad spelare, inlämning, omladdning, upplåsning och ny rond.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_CONTENT, DEMO_PLAYERS, createDemoRound, buildPlayerView } from '@vampyre/engine';
import { MemoryStore, handle, type ServerContext } from '@vampyre/server';
import { Root } from '../src/Root';
import { ApiClientError, type ApiClient } from '../src/server/apiClient';
import type { AuthClient, AuthUser } from '../src/server/auth';
import { loadServerScreen } from '../src/server/serverPort';
import { isNewRound } from '../src/server/useRoundWatcher';
import { restoreDraft, toSubmitted } from '../src/screen/viewPort';
import type { DraftAction } from '../src/screen/model';

afterEach(cleanup);

async function world() {
  const store = new MemoryStore();
  const gm = store.addUser('gm@test', { platformAdmin: true });
  const prince = store.addUser('prince@test');
  const ctx = (userId: string | null): ServerContext => ({
    userId,
    store,
    auth: store,
    now: () => 1_000,
    randomSeed: () => 'seed',
    newId: () => 'camp-1',
  });
  const { campaignId } = await handle({ op: 'gm_create_campaign', name: 'Test', demo: true }, ctx(gm));
  await handle({ op: 'gm_assign', campaignId, email: 'prince@test', role: 'player', playerId: DEMO_PLAYERS.prince }, ctx(gm));
  const apiFor = (userId: string | null): ApiClient => ({
    async call(req) {
      try {
        return (await handle(req as never, ctx(userId))) as never;
      } catch (e) {
        const err = e as { status?: number; code?: string; message: string };
        throw new ApiClientError(err.status ?? 500, err.code ?? 'internal', err.message);
      }
    },
  });
  const resolve = () => handle({ op: 'gm_resolve', campaignId }, ctx(gm));
  return { store, campaignId, apiFor, resolve, users: { gm, prince } };
}

function fakeAuth(user: AuthUser | null): AuthClient & { set(u: AuthUser | null): void } {
  let current = user;
  const ls = new Set<(u: AuthUser | null) => void>();
  return {
    currentUser: async () => current,
    accessToken: async () => (current ? 'token' : null),
    signIn: async (email) => {
      if (email !== 'prince@test') return { error: 'Fel e-post eller lösenord' };
      current = { id: 'p', email };
      ls.forEach((l) => l(current));
      return { error: null };
    },
    signOut: async () => {
      current = null;
      ls.forEach((l) => l(null));
    },
    onChange: (cb) => {
      ls.add(cb);
      return () => ls.delete(cb);
    },
    set(u) {
      current = u;
      ls.forEach((l) => l(u));
    },
  };
}

describe('restoreDraft', () => {
  it('bygger tillbaka radtexter, även när en Move ändrar var nästa action sker', () => {
    const { state, events } = createDemoRound();
    const view = buildPlayerView(state, DEFAULT_CONTENT, DEMO_PLAYERS.prince, { events });
    const draft: DraftAction[] = [
      { uid: 'a', actionId: 'move', performer: { kind: 'vampire' }, params: { to: 'south' }, paramLabels: { to: 'South' } },
      { uid: 'b', actionId: 'bleed', performer: { kind: 'vampire' }, params: {}, paramLabels: {} },
    ];
    const restored = restoreDraft(view, DEFAULT_CONTENT, draft.map(toSubmitted));
    expect(restored).toEqual(draft);
  });

  it('en entry utan key får ett eget uid', () => {
    const { state } = createDemoRound();
    const view = buildPlayerView(state, DEFAULT_CONTENT, DEMO_PLAYERS.prince);
    const [r] = restoreDraft(view, DEFAULT_CONTENT, [{ actionId: 'bleed', performer: { kind: 'vampire' } }]);
    expect(r!.uid).toBe('restored-1');
  });
});

describe('serverporten', () => {
  it('lämnar in, och efter omladdning är listan kvar och låst', async () => {
    const w = await world();
    const api = w.apiFor(w.users.prince);
    const first = await loadServerScreen(api, w.campaignId);
    expect(first.port.initialDraft()).toEqual([]);
    const draft: DraftAction[] = [{ uid: 'k1', actionId: 'bleed', performer: { kind: 'vampire' }, params: {}, paramLabels: {} }];
    expect(await first.port.confirm(draft, { royalPrivilegesToSpend: 1 })).toEqual({ ok: true, errors: [] });
    expect(first.port.isLocked()).toBe(true);

    const again = await loadServerScreen(api, w.campaignId);
    expect(again.port.isLocked()).toBe(true);
    expect(again.port.initialDraft()).toEqual([{ ...draft[0], paramLabels: {} }]);
    expect(again.port.initialExtras()).toEqual({ royalPrivilegesToSpend: 1 });

    await again.port.unlock();
    expect(again.port.isLocked()).toBe(false);
    expect((await loadServerScreen(api, w.campaignId)).port.isLocked()).toBe(false);
  });

  it('serverns valideringsfel och stängd rond blir fel i panelen, inte undantag', async () => {
    const w = await world();
    const api = w.apiFor(w.users.prince);
    const { port } = await loadServerScreen(api, w.campaignId);
    const nine = Array.from({ length: 9 }, (_, i): DraftAction => ({
      uid: `k${i}`, actionId: 'bleed', performer: { kind: 'vampire' }, params: {}, paramLabels: {},
    }));
    const bad = await port.confirm(nine);
    expect(bad.ok).toBe(false);
    expect(bad.errors.length).toBeGreaterThan(0);
    await w.resolve();
    const stale = await port.confirm(nine.slice(0, 1));
    expect(stale).toEqual({ ok: false, errors: ['Ronden har bytts: aktuell rond är 2'] });
  });

  it('isNewRound: bara rond och fas räknas', () => {
    const s = { round: 1, phase: 'submission', windowStatus: 'open' as const };
    expect(isNewRound(s, { ...s, windowStatus: 'closed' })).toBe(false);
    expect(isNewRound(s, { ...s, round: 2 })).toBe(true);
    expect(isNewRound(s, { ...s, phase: 'finished' })).toBe(true);
  });
});

describe('Root', () => {
  it('inloggning → skärmen från servern; confirm överlever omladdning; ny rond nollställer', async () => {
    const w = await world();
    const api = w.apiFor(w.users.prince);
    const auth = fakeAuth(null);
    const user = userEvent.setup();
    const { unmount } = render(<Root auth={auth} api={api} />);

    await user.type(await screen.findByLabelText('E-post'), 'fel@test');
    await user.type(screen.getByLabelText('Lösenord'), 'x');
    await user.click(screen.getByRole('button', { name: 'Logga in' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Fel e-post eller lösenord');

    await user.clear(screen.getByLabelText('E-post'));
    await user.type(screen.getByLabelText('E-post'), 'prince@test');
    await user.click(screen.getByRole('button', { name: 'Logga in' }));
    expect(await screen.findByText('Actions rond 1')).toBeTruthy();
    expect(screen.getByText('Prince Edmund Hale')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '+ Lägg till action' }));
    const select = screen.getByRole('combobox', { name: 'Välj action' });
    const bleed = within(select).getAllByRole('option').find((o) => o.textContent?.startsWith('Bleed –'))!;
    await user.selectOptions(select, bleed);
    await user.click(screen.getByRole('button', { name: 'Confirm actions' }));
    expect(await screen.findByText('Actions inlämnade.')).toBeTruthy();

    // "Omladdning": ny Root med samma inloggning.
    unmount();
    render(<Root auth={auth} api={api} />);
    expect(await screen.findByText('Actions inlämnade.')).toBeTruthy();
    expect(screen.getAllByTestId('draft-row')[0]!.textContent).toContain('Bleed i North');

    // GM löser ronden; fliken blir synlig igen → ny rond, tom lista.
    await w.resolve();
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(await screen.findByText('Actions rond 2')).toBeTruthy();
    await waitFor(() => expect(screen.queryAllByTestId('draft-row')).toHaveLength(0));
    expect(screen.getByRole('button', { name: 'Confirm actions' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Logga ut' }));
    expect(await screen.findByRole('button', { name: 'Logga in' })).toBeTruthy();
  });

  it('användare utan spelare får besked, inte en tom skärm', async () => {
    const w = await world();
    render(<Root auth={fakeAuth({ id: 'gm', email: 'gm@test' })} api={w.apiFor(w.users.gm)} />);
    expect(await screen.findByText(/Du har ingen spelare i någon kampanj/)).toBeTruthy();
  });
});
