/**
 * Pure audit payload rules for logout / stale session (unit-tested, no Electron deps).
 */
export type SessionUserSnapshot = {
  id: string;
  username: string;
  isActive: boolean;
};

export type LogoutAuditPayload = {
  userId: string | null;
  action: "LOGOUT" | "LOGOUT_ORPHAN" | "SESSION_INVALIDATED";
  entityType: "session";
  metadata: Record<string, unknown>;
};

export function buildLogoutAuditPayload(
  sessionUserId: string,
  user: SessionUserSnapshot | null,
): LogoutAuditPayload {
  if (user?.isActive) {
    return {
      userId: user.id,
      action: "LOGOUT",
      entityType: "session",
      metadata: { username: user.username },
    };
  }
  return {
    userId: null,
    action: user ? "LOGOUT_ORPHAN" : "LOGOUT_ORPHAN",
    entityType: "session",
    metadata: {
      previousUserId: sessionUserId,
      username: user?.username ?? null,
      reason: user ? "user_inactive" : "user_not_found",
    },
  };
}

export function buildStaleSessionInvalidationPayload(sessionUserId: string): LogoutAuditPayload {
  return {
    userId: null,
    action: "SESSION_INVALIDATED",
    entityType: "session",
    metadata: {
      previousUserId: sessionUserId,
      reason: "stale_session_at_startup",
    },
  };
}
