/** Read-only integration boundary; map interaction and audio stay in TouchMap. */
export interface TouchMapState {
  version: 1;
  feature: 'touchmap';
  map: 'loading' | 'ready' | 'error';
  audioUnlock: 'waiting' | 'starting' | 'succeeded' | 'error';
}

const listeners = new Set<(state: Readonly<TouchMapState>) => void>();
let state: Readonly<TouchMapState> = Object.freeze({
  version: 1,
  feature: 'touchmap',
  map: 'loading',
  audioUnlock: 'waiting',
});

export function updateIntegrationState(patch: Partial<Pick<TouchMapState, 'map' | 'audioUnlock'>>): void {
  state = Object.freeze({ ...state, ...patch });
  for (const listener of listeners) {
    // A host dashboard listener must never break map initialization or audio.
    try { listener(state); } catch (error) { console.error('TouchMap status listener failed', error); }
  }
}

const integration = Object.freeze({
  getState: () => state,
  subscribe(listener: (state: Readonly<TouchMapState>) => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
});

declare global {
  interface Window { touchmapIntegration: typeof integration; }
}

window.touchmapIntegration = integration;
