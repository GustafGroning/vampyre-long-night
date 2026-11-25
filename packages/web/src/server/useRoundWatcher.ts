/**
 * Håller koll på när ronden byts (P6): frågar servern med jämna mellanrum och när
 * fliken blir synlig igen. `onChange` anropas när rond, fas eller fönsterstatus
 * skiljer sig från det skärmen laddades med.
 */
import { useEffect, useRef } from 'react';
import type { StatusResponse } from '@vampyre/server/api';
import type { ApiClient } from './apiClient';

export const ROUND_POLL_MS = 30_000;

export function isNewRound(loaded: StatusResponse, now: StatusResponse): boolean {
  return now.round !== loaded.round || now.phase !== loaded.phase;
}

export function useRoundWatcher(
  api: ApiClient,
  campaignId: string,
  loaded: StatusResponse,
  onChange: () => void,
  intervalMs = ROUND_POLL_MS,
): void {
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      try {
        const s = await api.call({ op: 'status', campaignId });
        if (!stopped && isNewRound(loaded, s)) cb.current();
      } catch {
        // Nätfel: försök igen vid nästa tick.
      }
    };
    const id = setInterval(check, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [api, campaignId, loaded.round, loaded.phase, intervalMs]);
}
