import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { app } from "electron";

const ID_FILENAME = "machine-identity.json";

type MachineIdentityFile = {
  id: string;
  createdAt: string;
  hostname: string;
};

let cachedId: string | null = null;

function identityPath(): string {
  return path.join(app.getPath("userData"), ID_FILENAME);
}

/**
 * Stable per-installation machine identifier (persisted in userData).
 * Used in backup manifests for factory audit trails.
 */
export function getMachineIdentifier(): string {
  if (cachedId) return cachedId;

  const filePath = identityPath();
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as MachineIdentityFile;
    if (typeof raw.id === "string" && raw.id.length >= 8) {
      cachedId = raw.id;
      return cachedId;
    }
  } catch {
    /* first run */
  }

  const id = crypto.randomUUID();
  const payload: MachineIdentityFile = {
    id,
    createdAt: new Date().toISOString(),
    hostname: os.hostname(),
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  cachedId = id;
  return id;
}

/** Test-only reset */
export function resetMachineIdentifierCacheForTests(): void {
  cachedId = null;
}
