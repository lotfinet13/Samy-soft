export type ReleaseChannel = "dev" | "beta" | "production";

const CHANNELS: ReleaseChannel[] = ["dev", "beta", "production"];

export function parseReleaseChannel(raw: string | undefined): ReleaseChannel {
  const normalized = (raw ?? "production").trim().toLowerCase();
  if (CHANNELS.includes(normalized as ReleaseChannel)) {
    return normalized as ReleaseChannel;
  }
  return "production";
}

/** Subdirectory under Electron userData for isolated SQLite per channel. */
export function userDataChannelSegment(channel: ReleaseChannel): string {
  if (channel === "production") return "";
  return channel;
}

export function resolveDatabaseBasename(channel: ReleaseChannel): string {
  if (channel === "production") return "samy-soft.sqlite";
  return `samy-soft-${channel}.sqlite`;
}

export function isFeatureGateEnabled(flag: string | undefined): boolean {
  return flag === "1" || flag?.toLowerCase() === "true";
}
