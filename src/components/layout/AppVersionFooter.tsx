import { IPC_CHANNELS } from "@shared/ipc-channels";
import { useEffect, useState } from "react";

import { samyInvoke } from "@/lib/samy";
import type { WorkstationInfoDTO } from "@/types/ipc";

export function AppVersionFooter() {
  const [info, setInfo] = useState<WorkstationInfoDTO | null>(null);

  useEffect(() => {
    void samyInvoke<WorkstationInfoDTO>(IPC_CHANNELS.APP_WORKSTATION_INFO)
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  if (!info) {
    return (
      <footer className="shrink-0 border-t border-border bg-surface-elevated px-4 py-1.5 text-center text-[10px] text-foreground-muted">
        SAMY SOFT
      </footer>
    );
  }

  return (
    <footer
      className="shrink-0 border-t border-border bg-surface-elevated px-4 py-1.5 text-[10px] text-foreground-muted"
      title={`Machine: ${info.machineId} · Schéma: ${info.schemaPrismaSha256}`}
    >
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 font-mono">
        <span>
          SAMY SOFT <span className="text-foreground">v{info.version}</span>
        </span>
        <span className="text-foreground-muted/60">·</span>
        <span>schéma {info.schemaVersion}</span>
        <span className="text-foreground-muted/60">·</span>
        <span>
          Electron {info.electronVersion} · {info.platform}
        </span>
        <span className="text-foreground-muted/60">·</span>
        <span>{info.hostname}</span>
      </div>
    </footer>
  );
}
