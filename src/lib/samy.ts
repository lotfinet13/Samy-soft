import type { IPC_CHANNELS } from "@shared/ipc-channels";

import { logger } from "@/lib/logger";
import { notifyIpcFailure } from "@/lib/notify";

export { formatIpcError } from "@/lib/ipc-errors";

type SamyBridge = {
  invoke: <TResponse>(channel: string, payload?: unknown) => Promise<TResponse>;
};

export type SamyInvokeOptions = {
  /** When false, failures are only logged (no toast). Default: true. */
  toastOnError?: boolean;
};

export async function samyInvoke<TResponse>(
  channel: (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS],
  payload?: unknown,
  options?: SamyInvokeOptions,
): Promise<TResponse> {
  const bridge = (window as Window & { samy?: SamyBridge }).samy;
  if (typeof bridge?.invoke !== "function") {
    throw new Error("Bridge IPC SAMY indisponible : le preload n'a pas exposé window.samy.invoke.");
  }

  const toastOnError = options?.toastOnError ?? true;

  try {
    return await bridge.invoke<TResponse>(channel, payload);
  } catch (error) {
    logger.error("ipc", channel, error);
    if (toastOnError) {
      notifyIpcFailure(error);
    }
    throw error;
  }
}
