import type { IPC_CHANNELS } from "@shared/ipc-channels";

export async function samyInvoke<TResponse>(
  channel: (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS],
  payload?: unknown,
): Promise<TResponse> {
  return window.samy.invoke<TResponse>(channel, payload);
}
