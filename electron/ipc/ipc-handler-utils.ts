import type { ZodType } from "zod";
import { captureMainProcessError } from "../services/logger-service.js";
import { toIpcPayload } from "../utils/serialize-for-ipc.js";

export { toIpcPayload };

/** Parse IPC payload with Zod; surfaces French-friendly validation errors. */
export function parseIpcPayload<T>(schema: ZodType<T>, payload: unknown, label = "payload"): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Données invalides (${label}) : ${detail}`);
  }
  return parsed.data;
}

/**
 * Wrap an ipcMain.handle callback: log failures, ensure response is IPC-safe.
 * Use for new handlers; existing handlers can migrate incrementally.
 */
export function wrapIpcHandler<TPayload, TResult>(
  channel: string,
  handler: (payload: TPayload) => Promise<TResult>,
  options?: { serializeResponse?: boolean },
): (payload: unknown) => Promise<TResult> {
  const serializeResponse = options?.serializeResponse ?? true;
  return async (payload: unknown) => {
    try {
      const result = await handler(payload as TPayload);
      return serializeResponse ? toIpcPayload(result, channel) : result;
    } catch (error) {
      await captureMainProcessError(`ipc:${channel}`, error, { channel });
      throw error;
    }
  };
}
