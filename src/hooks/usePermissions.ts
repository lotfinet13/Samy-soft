import { useAuthStore } from "@/stores/auth-store";
import { useMemo } from "react";

function normalizePermissionCodes(permissions: unknown): string[] {
  if (typeof permissions === "string") {
    try {
      const parsed: unknown = JSON.parse(permissions);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string")
        : [];
    } catch {
      return [];
    }
  }

  if (!Array.isArray(permissions)) return [];

  return permissions.filter((item): item is string => typeof item === "string");
}

export function usePermissions(): {
  can: (permission: string) => boolean;
} {
  const user = useAuthStore((state) => state.user);

  const codes = useMemo(() => normalizePermissionCodes(user?.role.permissions), [user?.role.permissions]);

  const can = useMemo(() => {
    return (permission: string): boolean => {
      if (codes.includes("*")) return true;
      return codes.includes(permission);
    };
  }, [codes]);

  return { can };
}
