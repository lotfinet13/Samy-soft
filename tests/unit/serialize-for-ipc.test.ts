import { describe, expect, it } from "vitest";
import { Decimal } from "../../electron/prisma-client.js";
import {
  findNonSerializableFields,
  serializeForIpc,
  toIpcPayload,
} from "../../electron/utils/serialize-for-ipc.ts";

describe("serializeForIpc", () => {
  it("converts Decimal, Date, and bigint to clone-safe values", () => {
    const input = {
      cost: new Decimal("12.5"),
      at: new Date("2024-01-02T03:04:05.000Z"),
      big: 9n,
      nested: [{ qty: new Decimal("1") }],
    };

    const serialized = serializeForIpc(input);
    expect(serialized.cost).toBe("12.5");
    expect(serialized.at).toBe("2024-01-02T03:04:05.000Z");
    expect(serialized.big).toBe("9");
    expect(serialized.nested[0]?.qty).toBe("1");

    expect(() => structuredClone(serialized)).not.toThrow();
  });

  it("serializes arrays and plain nested objects", () => {
    const serialized = serializeForIpc({
      tags: ["a", "b"],
      meta: { ok: true, count: 2 },
    });
    expect(serialized).toEqual({ tags: ["a", "b"], meta: { ok: true, count: 2 } });
  });

  it("toIpcPayload returns clone-safe payload", () => {
    const out = toIpcPayload({ total: new Decimal("9.99") }, "test:channel");
    expect(out.total).toBe("9.99");
    expect(() => structuredClone(out)).not.toThrow();
  });

  it("findNonSerializableFields reports offending paths", () => {
    const issues = findNonSerializableFields({
      ok: "yes",
      bad: new Decimal("3"),
      when: new Date(),
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        { path: "root.bad", type: "Prisma.Decimal" },
        { path: "root.when", type: "Date" },
      ]),
    );
  });
});
