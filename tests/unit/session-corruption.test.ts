import { describe, expect, it } from "vitest";
import { detectCorruptedSessionPayload } from "../../electron/services/auth-service.js";

describe("detectCorruptedSessionPayload", () => {
  it("accepts null session", () => {
    expect(detectCorruptedSessionPayload(null)).toEqual({ corrupted: false });
  });

  it("accepts valid UUID userId", () => {
    expect(
      detectCorruptedSessionPayload({
        userId: "a1b2c3d4-e5f6-4789-a012-3456789abcde",
      }),
    ).toEqual({ corrupted: false });
  });

  it("rejects missing userId", () => {
    const r = detectCorruptedSessionPayload({ userId: "" } as { userId: string });
    expect(r.corrupted).toBe(true);
  });

  it("rejects non-uuid userId", () => {
    const r = detectCorruptedSessionPayload({ userId: "not-a-uuid" });
    expect(r.corrupted).toBe(true);
  });
});
