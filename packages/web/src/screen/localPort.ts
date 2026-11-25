/**
 * Utvecklingsport: kör motorn i webbläsaren mot en kampanj i minnet.
 *
 * Läsning och actionval går via `createViewPort` och använder bara spelarens
 * `PlayerView`. Inlämningen kör motorns `submitActions` mot hela `GameState`,
 * vilket i spelet görs på servern (SPEC B1). En serverport byter bara ut den biten.
 */
import {
  DEFAULT_CONTENT,
  buildPlayerView,
  openRound,
  setLocked,
  submitActions,
  type ActionRegistry,
  type Content,
  type GameState,
  type PlayerId,
  type RoundEvent,
  type RoundWindow,
} from '@vampyre/engine';
import type { PlayerScreenPort } from './model';
import { createViewPort } from './viewPort';

export interface LocalPortOptions {
  state: GameState;
  playerId: PlayerId;
  /** Förra rondens events: avgör vilka andra pjäser spelaren såg. */
  events?: readonly RoundEvent[];
  content?: Content;
  registry?: ActionRegistry;
}

/** Motorn har ingen klocka (M10). Utvecklingsporten använder en fast tid och en deadline långt fram. */
const NOW = 0;
const FAR_DEADLINE = Number.MAX_SAFE_INTEGER;

export function createLocalPort(opts: LocalPortOptions): PlayerScreenPort {
  const content = opts.content ?? DEFAULT_CONTENT;
  const { state, playerId } = opts;
  const view = buildPlayerView(state, content, playerId, opts.events ? { events: opts.events } : {});
  let window: RoundWindow = openRound(state, { seed: 'local-dev', deadline: FAR_DEADLINE });

  return createViewPort({
    view,
    content,
    ...(opts.registry ? { registry: opts.registry } : {}),
    submit(actions, extras) {
      const res = submitActions(
        window,
        state,
        { playerId, actions, royalPrivilegesToSpend: extras.royalPrivilegesToSpend },
        NOW,
        { content, ...(opts.registry ? { registry: opts.registry } : {}) },
      );
      if (!res.ok) return { ok: false, errors: res.validation.errors.map((e) => e.message) };
      window = setLocked(res.window, playerId, true, NOW);
      return { ok: true, errors: [] };
    },
    unlock() {
      if (window.submissions[playerId]) window = setLocked(window, playerId, false, NOW);
    },
    isLocked: () => window.submissions[playerId]?.locked === true,
  });
}
