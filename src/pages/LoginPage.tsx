import { zodResolver } from "@hookform/resolvers/zod";
import { IPC_CHANNELS } from "@shared/ipc-channels";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { FormField } from "@/components/ui/FormField";
import { refreshSession, refreshSettingsSilently } from "@/lib/bootstrap";
import { cn } from "@/lib/cn";
import { samyInvoke } from "@/lib/samy";
import { loginSchema, type LoginFormValues } from "@/modules/auth/login-schema";
import { useAuthStore, type PublicBranding } from "@/stores/auth-store";
import type { WorkstationInfoDTO } from "@/types/ipc";
import type { SessionUser } from "@/types/session";

type LoginResponse =
  | { ok: false; reason: "INVALID_CREDENTIALS" | "DISABLED" }
  | { ok: true; user: SessionUser; branding: PublicBranding };

export function LoginPage() {
  const navigate = useNavigate();
  const setHydrated = useAuthStore((state) => state.setHydrated);
  const hydrated = useAuthStore((state) => state.hydrated);
  const user = useAuthStore((state) => state.user);
  const [formError, setFormError] = useState<string | null>(null);
  const [dbOk, setDbOk] = useState<boolean | null>(null);
  const [workstation, setWorkstation] = useState<WorkstationInfoDTO | null>(null);
  const usernameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void refreshSession();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (user) navigate("/", { replace: true });
  }, [hydrated, user, navigate]);

  useEffect(() => {
    void samyInvoke<WorkstationInfoDTO>(IPC_CHANNELS.APP_WORKSTATION_INFO)
      .then(setWorkstation)
      .catch(() => setWorkstation(null));
    void samyInvoke(IPC_CHANNELS.DB_HEALTH)
      .then(() => setDbOk(true))
      .catch(() => setDbOk(false));
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => usernameRef.current?.focus(), 180);
    return () => window.clearTimeout(id);
  }, []);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const usernameRegister = form.register("username");

  async function authenticate(values: LoginFormValues): Promise<void> {
    setFormError(null);
    const res = await samyInvoke<LoginResponse>(IPC_CHANNELS.AUTH_LOGIN, values);
    if (!res.ok) {
      const msg =
        res.reason === "DISABLED"
          ? "Compte désactivé — contactez un administrateur."
          : "Identifiants ou mot de passe incorrect.";
      setFormError(msg);
      return;
    }

    useAuthStore.getState().setUser(res.user);
    useAuthStore.getState().setBranding(res.branding);
    await refreshSettingsSilently();
    setHydrated(true);
    navigate("/", { replace: true });
  }

  const onSubmit = form.handleSubmit(authenticate);

  return (
    <div className="flex min-h-full min-w-[1024px] flex-row bg-sidebar-bg">
      <section className="relative hidden w-[460px] flex-col border-r border-sidebar-border bg-[rgb(26_29_39)] text-sidebar-fg xl:flex">
        <div className="flex flex-1 flex-col gap-10 p-10">
          <header>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sidebar-fg-muted">
              ERP industriel — hors ligne
            </p>
            <h1 className="mt-4 text-xl font-semibold tracking-tight text-sidebar-fg">SAMY SOFT</h1>
            <p className="mt-3 max-w-[22rem] text-[13px] leading-snug text-sidebar-fg-muted">
              Poste contrôle atelier&nbsp;: données locales SQLite, aucun cloud,&nbsp;piste d’audit sur
              actions sensibles.
            </p>
          </header>

          <dl className="grid gap-y-6 border-t border-sidebar-border pt-8 text-[12px] leading-snug">
            <LoginMeta label="État base locale">
              {dbOk === null ? (
                <span className="text-sidebar-fg-muted">Vérification…</span>
              ) : dbOk ? (
                <span className="flex items-center gap-2 text-sidebar-fg">
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 ring-[3px] ring-emerald-500/25"
                  />
                  SQLite prête au poste
                </span>
              ) : (
                <span className="flex items-center gap-2 font-semibold text-amber-200">
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                  Incident base locale
                </span>
              )}
            </LoginMeta>

            <LoginMeta label="Poste réseau" variant="muted">
              {workstation?.hostname ?? "—"}
            </LoginMeta>

            <LoginMeta label="Version application" variant="muted">
              <span>{workstation?.version ?? "—"}</span>
              {workstation?.platform ? (
                <span className="mt-1 block text-sidebar-fg-muted">
                  Plateforme {workstation.platform}
                </span>
              ) : null}
            </LoginMeta>

            <LoginMeta label="Licence exploitation" variant="muted">
              Usage interne usine&nbsp;– base cryptée hors connexion réseau.
            </LoginMeta>
          </dl>
        </div>

        <footer className="border-t border-sidebar-border px-10 py-3 text-[11px] text-sidebar-fg-muted">
          © {new Date().getFullYear()} SAMY SOFT • Poste workstation 1366×768 recommandé
        </footer>
      </section>

      <section className="flex min-h-full min-w-0 flex-1 flex-col bg-surface text-foreground">
        <header className="border-b border-border bg-surface-elevated px-6 py-2.5 xl:hidden">
          <div className="text-[13px] font-semibold tracking-tight text-foreground">SAMY SOFT</div>
          <div className="text-[11.5px] text-foreground-muted">Connexion workstation</div>
        </header>

        <div className="flex flex-1 justify-start 2xl:justify-center">
          <div className="flex w-full max-w-xl flex-col justify-between gap-10 px-8 py-10 sm:px-12">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground-muted">
                Sécurité locale
              </p>
              <h2 className="mt-3 text-xl font-semibold tracking-tight">Authentifier le poste</h2>
              <p className="mt-2 max-w-lg text-[13px] text-foreground-muted">
                Contrôle d’accès par identifiant utilisateur bcrypt. Journal des connexions enregistré
                en base après ouverture de session.
              </p>

              <form
                data-testid="login-form"
                className="mt-10 space-y-5"
                onKeyDown={(evt) => {
                  if (!(evt.ctrlKey || evt.metaKey)) return;
                  if (evt.key !== "Enter") return;
                  evt.preventDefault();
                  void onSubmit(evt);
                }}
                onSubmit={onSubmit}
              >
                <FormField label="Identifiant" error={form.formState.errors.username?.message}>
                  <input
                    data-testid="login-username"
                    autoComplete="username"
                    spellCheck={false}
                    placeholder="Nom d’utilisateur"
                    autoCapitalize="none"
                    autoCorrect="off"
                    tabIndex={0}
                    className={cn("focus-ring control-chrome w-full font-mono")}
                    {...usernameRegister}
                    ref={(el) => {
                      usernameRegister.ref(el);
                      usernameRef.current = el;
                    }}
                  />
                </FormField>

                <FormField label="Mot de passe" error={form.formState.errors.password?.message}>
                  <input
                    data-testid="login-password"
                    autoComplete="current-password"
                    type="password"
                    tabIndex={0}
                    className={cn("focus-ring control-chrome w-full font-mono")}
                    {...form.register("password")}
                  />
                </FormField>

                {formError ? (
                  <div className="border border-danger/40 bg-danger/10 px-3 py-2 text-[12px] font-semibold text-danger">
                    {formError}
                  </div>
                ) : null}

                <button
                  data-testid="login-submit"
                  type="submit"
                  tabIndex={0}
                  className="focus-ring inline-flex min-h-touch w-full items-center justify-center border border-accent/85 bg-accent px-4 py-2 text-[13px] font-semibold text-accent-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] hover:bg-accent/95 disabled:border-border disabled:bg-surface-muted disabled:text-foreground-muted"
                  disabled={form.formState.isSubmitting}
                >
                  Connexion
                </button>
              </form>

              <p className="mt-8 border border-border bg-surface-muted/80 px-3 py-2 text-[11.5px] leading-snug text-foreground-muted">
                <span className="font-semibold text-foreground">Sécurité poste première installation</span>
                {' '}
                — changez le mot de passe administrateur immédiatement après déploiement usine (voir
                README).
              </p>
            </div>

            <footer className="border-t border-border pt-3 text-[11px] text-foreground-muted">
              Raccourci&nbsp;:{' '}
              <kbd className="rounded border border-border bg-surface-elevated px-1 py-px font-mono text-[10px]">
                Ctrl
              </kbd>
              {' '}
              +
              {' '}
              <kbd className="rounded border border-border bg-surface-elevated px-1 py-px font-mono text-[10px]">
                Entrée
              </kbd>{' '}
              soumet le formulaire.
            </footer>
          </div>
        </div>
      </section>
    </div>
  );
}

function LoginMeta(props: {
  label: string;
  variant?: "default" | "muted";
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt
        className={cn(
          "text-[10px] font-semibold uppercase tracking-wide",
          props.variant === "muted" ? "text-sidebar-fg-muted" : "text-sidebar-fg",
        )}
      >
        {props.label}
      </dt>
      <dd
        className={cn(
          "mt-1 leading-snug",
          props.variant === "muted" ? "text-sidebar-fg/90" : "text-sidebar-fg",
        )}
      >
        {props.children}
      </dd>
    </div>
  );
}
