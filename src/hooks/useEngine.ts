import { useEffect, useSyncExternalStore } from 'react';
import { engine } from '../engine/EngineClient';

let version = 0;
engine.subscribe(() => version++);

/** Re-renders on engine state changes and starts the engine on first use. */
export function useEngineState() {
  useSyncExternalStore(
    (cb) => engine.subscribe(cb),
    () => version,
  );
  useEffect(() => {
    engine.init().catch(() => {});
  }, []);
  return { state: engine.state, progress: engine.progress, error: engine.errorMessage, name: engine.engineName, threads: engine.threads };
}
