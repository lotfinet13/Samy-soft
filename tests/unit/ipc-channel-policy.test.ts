import { describe, expect, it } from "vitest";
import {
  assertIpcChannelRegistry,
  isAllowedIpcChannel,
  listAllowedIpcChannels,
} from "../../shared/ipc-channel-policy.ts";
import { IPC_CHANNELS } from "../../shared/ipc-channels.ts";

describe("ipc-channel-policy", () => {
  it("registry has unique channel strings", () => {
    const { unique, count } = assertIpcChannelRegistry();
    expect(unique).toBe(true);
    expect(count).toBeGreaterThan(40);
  });

  it("allows known channels and rejects unknown", () => {
    expect(isAllowedIpcChannel(IPC_CHANNELS.BACKUP_EXPORT)).toBe(true);
    expect(isAllowedIpcChannel("evil:channel")).toBe(false);
  });

  it("listAllowedIpcChannels includes backup export", () => {
    expect(listAllowedIpcChannels()).toContain(IPC_CHANNELS.INVENTORY_DASHBOARD_SUMMARY);
  });
});
