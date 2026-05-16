/// <reference types="vite/client" />

interface SamyBridge {
  invoke: <TResponse>(channel: string, payload?: unknown) => Promise<TResponse>;
}

interface Window {
  samy: SamyBridge;
  /** Marqueur d’initialisation preload (audit / smoke QA). */
  __SAMY_PRELOAD_LOADED_AT__?: string;
}
