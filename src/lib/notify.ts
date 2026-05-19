import { useToastStore, type ToastTone } from "@/stores/toast-store";
import { formatIpcError } from "@/lib/ipc-errors";

/** Push a toast without going through IPC. */
export function notify(tone: ToastTone, message: string): void {
  useToastStore.getState().push(tone, message);
}

export function notifySuccess(message: string): void {
  notify("success", message);
}

export function notifyError(message: string): void {
  notify("error", message);
}

export function notifyInfo(message: string): void {
  notify("info", message);
}

/** Show toast from any thrown/rejected value. */
export function notifyFromError(error: unknown, fallback = "Une erreur est survenue."): void {
  notifyError(error instanceof Error ? error.message : fallback);
}

/** Same humanization as samyInvoke, for secondary loads that opt out of IPC toasts. */
export function notifyIpcFailure(error: unknown): void {
  notifyError(formatIpcError(error));
}
