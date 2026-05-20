import { describe, expect, it } from "vitest";
import {
  buildLogoutAuditPayload,
  buildStaleSessionInvalidationPayload,
} from "../../electron/services/session-logout-audit.ts";

describe("session logout audit payloads", () => {
  const sessionUserId = "11111111-1111-1111-1111-111111111111";

  it("LOGOUT with active user retains userId FK", () => {
    const payload = buildLogoutAuditPayload(sessionUserId, {
      id: sessionUserId,
      username: "admin",
      isActive: true,
    });
    expect(payload.action).toBe("LOGOUT");
    expect(payload.userId).toBe(sessionUserId);
    expect(payload.metadata.username).toBe("admin");
  });

  it("LOGOUT_ORPHAN when user row missing avoids FK userId", () => {
    const payload = buildLogoutAuditPayload(sessionUserId, null);
    expect(payload.action).toBe("LOGOUT_ORPHAN");
    expect(payload.userId).toBeNull();
    expect(payload.metadata.previousUserId).toBe(sessionUserId);
    expect(payload.metadata.reason).toBe("user_not_found");
  });

  it("LOGOUT_ORPHAN when user inactive", () => {
    const payload = buildLogoutAuditPayload(sessionUserId, {
      id: sessionUserId,
      username: "old",
      isActive: false,
    });
    expect(payload.userId).toBeNull();
    expect(payload.metadata.reason).toBe("user_inactive");
  });

  it("stale session invalidation at startup", () => {
    const payload = buildStaleSessionInvalidationPayload(sessionUserId);
    expect(payload.action).toBe("SESSION_INVALIDATED");
    expect(payload.userId).toBeNull();
    expect(payload.metadata.reason).toBe("stale_session_at_startup");
  });
});
