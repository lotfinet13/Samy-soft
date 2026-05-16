import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { app } from "electron";

const LOG_FILENAME = "samy-soft-main.log";
const STRUCTURED_FILENAME = "samy-soft-events.jsonl";

function formatStack(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  if (!error.stack) return undefined;
  return error.stack.replace(/\s+$/u, "").split("\n").slice(0, 40).join("\n");
}

export async function appendSamyMainLog(message: string, meta?: Record<string, unknown>): Promise<void> {
  const dir = path.join(app.getPath("userData"), "logs");
  await mkdir(dir, { recursive: true });
  const line = `[${new Date().toISOString()}] ${message}${meta ? ` ${JSON.stringify(meta)}` : ""}\n`;
  await appendFile(path.join(dir, LOG_FILENAME), line, "utf8");
}

type StructuredEventKind = "error" | "warn" | "info" | "ipc_failure" | "renderer_signal";

export async function appendStructuredEvent(kind: StructuredEventKind, payload: Record<string, unknown>): Promise<void> {
  const dir = path.join(app.getPath("userData"), "logs");
  await mkdir(dir, { recursive: true });
  const row = JSON.stringify({
    ts: new Date().toISOString(),
    kind,
    ...sanitizePayload(payload),
  });
  await appendFile(path.join(dir, STRUCTURED_FILENAME), `${row}\n`, "utf8");
}

/** Retire données à risque PII brute — garde diagnostics techniques. */
function sanitizePayload(meta: Record<string, unknown>): Record<string, unknown> {
  const block = new Set(["password", "passwordHash", "token", "secret", "authorization"]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (block.has(k.toLowerCase())) continue;
    if (typeof v === "string" && k.toLowerCase().includes("username")) {
      const u = v.trim();
      out[k] =
        u.length <= 3 ? "***" : `${u.slice(0, 2)}…${u.slice(-1)}`;
      continue;
    }
    out[k] = v;
  }
  return out;
}

export async function captureMainProcessError(area: string, error: unknown, extra?: Record<string, unknown>): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const stack = formatStack(error);
  await Promise.all([
    appendSamyMainLog(`ERROR[${area}]: ${message}`, { ...(extra ?? {}), stack }),
    appendStructuredEvent("error", {
      area,
      message,
      stack,
      ...extra,
    }),
  ]);
}

export function stringifyCrashSnippet(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  const st = formatStack(error);
  return st ? `${msg}\n---\n${st}` : msg;
}
