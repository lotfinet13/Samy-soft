import { recordMutation } from "@/lib/mutation-telemetry";
import { notifySuccess } from "@/lib/notify";
import { samyInvoke, type SamyInvokeOptions } from "@/lib/samy";

export type RunMutationOptions<T> = {
  action: () => Promise<T>;
  successMessage?: string;
  /** Called after successful action (e.g. cache invalidation + reload). */
  onSettled?: () => void | Promise<void>;
  ipc?: SamyInvokeOptions;
};

/** Execute a mutation with optional success toast and post-action refresh hooks. */
export async function runMutation<T>(options: RunMutationOptions<T>): Promise<T | null> {
  const area = options.successMessage ?? "mutation";
  try {
    const result = await options.action();
    recordMutation(area, true);
    if (options.successMessage) {
      notifySuccess(options.successMessage);
    }
    await options.onSettled?.();
    return result;
  } catch (error) {
    recordMutation(area, false, error instanceof Error ? error.message : String(error));
    return null;
  }
}

export type SamyMutationOptions<TPayload, _TResponse = unknown> = {
  channel: Parameters<typeof samyInvoke>[0];
  payload?: TPayload;
  successMessage?: string;
  onSettled?: () => void | Promise<void>;
  ipc?: SamyInvokeOptions;
};

export async function runSamyMutation<TPayload, TResponse>(
  options: SamyMutationOptions<TPayload, TResponse>,
): Promise<TResponse | null> {
  return runMutation({
    successMessage: options.successMessage,
    onSettled: options.onSettled,
    ipc: options.ipc,
    action: () => samyInvoke<TResponse>(options.channel, options.payload, options.ipc),
  });
}
