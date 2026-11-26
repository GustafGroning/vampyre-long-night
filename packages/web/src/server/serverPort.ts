/**
 * Porten mot spelservern. Vyn hämtas från servern (`screen`), och katalog och
 * analys körs sedan lokalt mot den, precis som i demoläget (`createViewPort`).
 * Inlämning och upplåsning går till servern, som validerar med motorn.
 */
import { DEFAULT_CONTENT, type Content } from '@vampyre/engine';
import type { ScreenResponse } from '@vampyre/server/api';
import type { PlayerScreenPort } from '../screen/model';
import { createViewPort } from '../screen/viewPort';
import { ApiClientError, type ApiClient } from './apiClient';

export interface LoadedScreen {
  port: PlayerScreenPort;
  screen: ScreenResponse;
}

export function createServerPort(api: ApiClient, screen: ScreenResponse, content: Content = DEFAULT_CONTENT): PlayerScreenPort {
  const { campaignId, round } = screen;
  let locked = screen.submission?.locked === true;
  return createViewPort({
    view: screen.view,
    content,
    submitted: screen.submission,
    async submit(actions, extras) {
      try {
        const res = await api.call({ op: 'submit', campaignId, round, actions, royalPrivilegesToSpend: extras.royalPrivilegesToSpend });
        if (!res.ok) return { ok: false, errors: res.errors };
        locked = true;
        return { ok: true, errors: [] };
      } catch (e) {
        return { ok: false, errors: [e instanceof ApiClientError ? e.message : 'Could not submit'] };
      }
    },
    async unlock() {
      await api.call({ op: 'unlock', campaignId, round });
      locked = false;
    },
    isLocked: () => locked,
  });
}

export async function loadServerScreen(api: ApiClient, campaignId: string, content?: Content): Promise<LoadedScreen> {
  const screen = await api.call({ op: 'screen', campaignId });
  return { screen, port: createServerPort(api, screen, content) };
}
