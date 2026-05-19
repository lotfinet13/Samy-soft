import { contextBridge, ipcRenderer } from "electron";
import { isAllowedIpcChannel } from "../shared/ipc-channel-policy.js";

/**
 * Le processus principal pose ce flag uniquement si E2E est demandé ET `app.isPackaged === false`.
 * Ne pas réactiver relax via `SAMY_E2E` ici : un installeur ne doit jamais exposer `globalThis.samy`.
 */
const e2eBridge = process.env.SAMY_SOFT_E2E_GLOBAL_BRIDGE === "1";

function writeE2ePreloadArtifact(): void {
  try {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    /* `cwd` correspond au dossier projet en dev / `electron.launch({ cwd })` pour les E2E. */
    const dir = path.resolve(process.cwd(), "e2e", "artifacts");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "preload-executed.txt"),
      `${new Date().toISOString()}\ncwd=${process.cwd()}\nsamyE2eEnv=${process.env.SAMY_E2E ?? ""}\nargv=${JSON.stringify(process.argv)}\n`,
      "utf8",
    );
  } catch {
    /* poste très restreint : ignorer */
  }
}

export type SamyPreloadApi = {
  invoke: <TResponse>(channel: string, payload?: unknown) => Promise<TResponse>;
};

type IpcLogEntry = { channel: string; ms: number; ok: boolean; at: string; error?: string };

function pushIpcLog(entry: IpcLogEntry): void {
  const g = globalThis as unknown as { __SAMY_IPC_LOG__?: IpcLogEntry[] };
  const ring = g.__SAMY_IPC_LOG__ ?? [];
  ring.push(entry);
  if (ring.length > 80) ring.shift();
  g.__SAMY_IPC_LOG__ = ring;
}

const api: SamyPreloadApi = {
  invoke<TResponse>(channel: string, payload?: unknown): Promise<TResponse> {
    if (!isAllowedIpcChannel(channel)) {
      return Promise.reject(new Error(`Canal IPC non autorisé : ${channel}`));
    }
    const t0 = performance.now();
    return ipcRenderer
      .invoke(channel, payload)
      .then((result) => {
        pushIpcLog({ channel, ms: Math.round(performance.now() - t0), ok: true, at: new Date().toISOString() });
        return result as TResponse;
      })
      .catch((reason: unknown) => {
        pushIpcLog({
          channel,
          ms: Math.round(performance.now() - t0),
          ok: false,
          at: new Date().toISOString(),
          error: reason instanceof Error ? reason.message : String(reason),
        });
        if (reason instanceof Error) return Promise.reject(reason);
        const message =
          reason && typeof reason === "object" && "message" in reason &&
          typeof (reason as { message: unknown }).message === "string"
            ? String((reason as { message: string }).message)
            : typeof reason === "string"
              ? reason
              : "Erreur IPC indéterminée.";
        return Promise.reject(new Error(message));
      }) as Promise<TResponse>;
  },
};

const stamp = new Date().toISOString();

if (e2eBridge) {
  writeE2ePreloadArtifact();
  Reflect.defineProperty(globalThis, "samy", {
    value: api,
    enumerable: true,
    configurable: false,
    writable: false,
  });
  Reflect.defineProperty(globalThis, "__SAMY_PRELOAD_LOADED_AT__", {
    value: stamp,
    enumerable: true,
    configurable: false,
    writable: false,
  });
  Reflect.defineProperty(globalThis, "__SAMY_E2E__", {
    value: true,
    enumerable: true,
    configurable: false,
    writable: false,
  });
} else {
  contextBridge.exposeInMainWorld("samy", api);
  contextBridge.exposeInMainWorld("__SAMY_PRELOAD_LOADED_AT__", stamp);
}
