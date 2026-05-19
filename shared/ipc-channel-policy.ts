import { IPC_CHANNELS } from "./ipc-channels.js";

const ALLOWED = new Set<string>(Object.values(IPC_CHANNELS));

/** Channels exposed to renderer via preload — must match main-process handlers. */
export function isAllowedIpcChannel(channel: string): boolean {
  return ALLOWED.has(channel);
}

export function listAllowedIpcChannels(): string[] {
  return [...ALLOWED].sort();
}

export function assertIpcChannelRegistry(): { count: number; unique: boolean } {
  const values = Object.values(IPC_CHANNELS);
  return { count: values.length, unique: values.length === new Set(values).size };
}
