import { type ReactElement, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { APP_SETTING_KEYS } from "@shared/settings-keys";
import { IPC_CHANNELS } from "@shared/ipc-channels";
import { samyInvoke } from "@/lib/samy";
import { useAuthStore } from "@/stores/auth-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useToastStore } from "@/stores/toast-store";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "mousemove"] as const;

export function SessionIdleGate(props: { children: React.ReactNode }): ReactElement {
  const settings = useSettingsStore((s) => s.settings);
  const hydrated = useAuthStore((s) => s.hydrated);
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const [locked, setLocked] = useState(false);
  const last = useRef(Date.now());

  const idleMinutesRaw = Number.parseInt(settings?.[APP_SETTING_KEYS.SESSION_IDLE_MINUTES] ?? "0", 10);
  const idleMs =
    hydrated && user && Number.isFinite(idleMinutesRaw) && idleMinutesRaw > 0
      ? idleMinutesRaw * 60_000
      : 0;

  const lockRequired = settings?.[APP_SETTING_KEYS.SESSION_LOCK_REQUIRED] === "true";

  useEffect(() => {
    if (!user) setLocked(false);
  }, [user]);

  const bumpActivity = useCallback(() => {
    last.current = Date.now();
  }, []);

  useEffect(() => {
    if (!idleMs || !hydrated || !user) return;
    for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, bumpActivity, { passive: true });
    return () => {
      for (const ev of ACTIVITY_EVENTS)
        window.removeEventListener(ev, bumpActivity as EventListener);
    };
  }, [bumpActivity, hydrated, idleMs, user]);

  useEffect(() => {
    if (!idleMs || !hydrated || !user) return;
    const id = window.setInterval(() => {
      if (locked) return;
      if (Date.now() - last.current < idleMs) return;
      if (lockRequired) {
        setLocked(true);
        return;
      }
      void (async () => {
        try {
          await samyInvoke(IPC_CHANNELS.AUTH_LOGOUT);
        } finally {
          useAuthStore.getState().setUser(null);
          useAuthStore.getState().setBranding(null);
          useToastStore.getState().push(
            "info",
            "Session expirée (inactivité) — reconnectez-vous pour continuer.",
            6200,
          );
          navigate("/login", { replace: true });
          last.current = Date.now();
        }
      })();
    }, Math.min(Math.max(Math.floor(idleMs / 3), 10_000), 300_000));
    return () => window.clearInterval(id);
  }, [hydrated, idleMs, lockRequired, locked, navigate, user]);

  return (
    <>
      {props.children}
      {locked && user ? (
        <div className="fixed inset-0 z-[250] flex flex-col items-center justify-center gap-4 bg-black/65 px-8 text-center text-foreground">
          <p className="text-lg font-semibold">Session verrouillée pour inactivité</p>
          <p className="max-w-sm text-sm text-foreground-muted">
            Sécurité atelier : réauthentification requise afin que le poste ne reste pas exposé sans
            surveillance.
          </p>
          <button
            type="button"
            className="focus-ring rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground"
            onClick={() => {
              void samyInvoke(IPC_CHANNELS.AUTH_LOGOUT).finally(() => {
                useAuthStore.getState().setUser(null);
                useAuthStore.getState().setBranding(null);
                setLocked(false);
                navigate("/login", { replace: true });
              });
            }}
          >
            Réauthentifier
          </button>
        </div>
      ) : null}
    </>
  );
}
