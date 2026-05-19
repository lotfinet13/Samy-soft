import { Decimal } from "../prisma-client.js";
import { decimalToString } from "../services/inventory-service.js";

export type NonSerializableField = {
  path: string;
  type: string;
};

const LOG_PREFIX = "[ipc-serialize]";

function isPrismaDecimal(value: unknown): value is Decimal {
  if (value instanceof Decimal) return true;
  if (value && typeof value === "object" && "d" in value && "e" in value && "s" in value) {
    try {
      new Decimal(value as Decimal);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function describeType(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (value instanceof Date) return "Date";
  if (isPrismaDecimal(value)) return "Prisma.Decimal";
  if (typeof value === "bigint") return "bigint";
  if (Buffer.isBuffer(value)) return "Buffer";
  if (value instanceof Map) return "Map";
  if (value instanceof Set) return "Set";
  if (typeof value === "object") {
    return (value as { constructor?: { name?: string } }).constructor?.name ?? "object";
  }
  return typeof value;
}

function isPlainSerializableLeaf(value: unknown): boolean {
  const t = typeof value;
  return (
    value === null ||
    value === undefined ||
    t === "string" ||
    t === "number" ||
    t === "boolean"
  );
}

/** Walk a value tree and list fields that cannot cross Electron structured clone. */
export function findNonSerializableFields(
  value: unknown,
  path = "root",
  issues: NonSerializableField[] = [],
): NonSerializableField[] {
  if (isPlainSerializableLeaf(value)) return issues;

  const t = typeof value;
  if (t === "bigint") {
    issues.push({ path, type: "bigint" });
    return issues;
  }
  if (value instanceof Date) {
    issues.push({ path, type: "Date" });
    return issues;
  }
  if (isPrismaDecimal(value)) {
    issues.push({ path, type: "Prisma.Decimal" });
    return issues;
  }
  if (Buffer.isBuffer(value)) {
    issues.push({ path, type: "Buffer" });
    return issues;
  }
  if (value instanceof Map || value instanceof Set) {
    issues.push({ path, type: describeType(value) });
    return issues;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      findNonSerializableFields(entry, `${path}[${index}]`, issues);
    });
    return issues;
  }

  if (t === "object" && value !== null) {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      findNonSerializableFields(nested, `${path}.${key}`, issues);
    }
  }

  return issues;
}

export function logNonSerializableFields(value: unknown, context: string): void {
  const issues = findNonSerializableFields(value);
  if (issues.length === 0) return;
  console.warn(`${LOG_PREFIX} ${context}`, issues);
}

function serializeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  const t = typeof value;
  if (t === "bigint") return value.toString();
  if (t === "string" || t === "number" || t === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (isPrismaDecimal(value)) return decimalToString(value);
  if (Buffer.isBuffer(value)) return value.toString("base64");

  if (Array.isArray(value)) {
    return value.map((entry) => serializeValue(entry));
  }

  if (t === "object") {
    if (value instanceof Map) {
      return Object.fromEntries(
        [...value.entries()].map(([k, v]) => [String(k), serializeValue(v)]),
      );
    }
    if (value instanceof Set) {
      return [...value].map((entry) => serializeValue(entry));
    }

    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = serializeValue(nested);
    }
    return out;
  }

  return value;
}

/** Recursively coerce Prisma / Node values into structured-clone-safe JSON. */
export function serializeForIpc<T>(value: T): T {
  return serializeValue(value) as T;
}

/** Dev guard: log offending paths then return a serialized payload. */
export function toIpcPayload<T>(value: T, context: string): T {
  logNonSerializableFields(value, context);
  return serializeForIpc(value);
}
