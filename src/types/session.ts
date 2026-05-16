import type { RoleName } from "@prisma/client";

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  role: {
    id: string;
    name: RoleName;
    labelFr: string;
    permissions: unknown;
  };
};
