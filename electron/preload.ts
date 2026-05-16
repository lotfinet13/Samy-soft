import fs from "node:fs";
import path from "node:path";

import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../shared/ipc-channels.js";

const allowedChannels = new Set<string>(Object.values(IPC_CHANNELS));

function preloadArtifactsDir(): string {
  /* `cwd` correspond au dossier projet en dev / `electron.launch({ cwd })` pour les E2E. */
  return path.resolve(process.cwd(), "e2e", "artifacts");
}

try {
  const dir = preloadArtifactsDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "preload-executed.txt"),
    `${new Date().toISOString()}\ncwd=${process.cwd()}\nsamyE2eEnv=${process.env.SAMY_E2E ?? ""}\nargv=${JSON.stringify(process.argv)}\n`,
    "utf8",
  );
} catch {
  /* poste très restreint : ignorer */
}

const e2eBridge =
  process.env.SAMY_SOFT_E2E_GLOBAL_BRIDGE === "1" ||
  process.env.SAMY_E2E === "1" ||
  process.argv.includes("--samy-e2e");

export type SamyPreloadApi = {
  invoke: <TResponse>(channel: string, payload?: unknown) => Promise<TResponse>;
};

const api: SamyPreloadApi = {
  invoke<TResponse>(channel: string, payload?: unknown): Promise<TResponse> {
    if (!allowedChannels.has(channel)) {
      return Promise.reject(new Error(`Canal IPC non autorisé : ${channel}`));
    }
    return ipcRenderer
      .invoke(channel, payload)
      .catch((reason: unknown) => {
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
} else {
  contextBridge.exposeInMainWorld("samy", api);
  contextBridge.exposeInMainWorld("__SAMY_PRELOAD_LOADED_AT__", stamp);
}
