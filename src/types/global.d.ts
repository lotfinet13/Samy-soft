export {};

declare global {
  interface Window {
    samy: {
      invoke<TResponse>(channel: string, payload?: unknown): Promise<TResponse>;
    };
  }
}
