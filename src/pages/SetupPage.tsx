import { IPC_CHANNELS } from "@shared/ipc-channels";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useNavigate } from "react-router-dom";
import { z } from "zod";
import { FormField } from "@/components/ui/FormField";
import { refreshBootstrapStatus, refreshSettingsSilently } from "@/lib/bootstrap";
import { cn } from "@/lib/cn";
import { samyInvoke } from "@/lib/samy";
import { useAuthStore, type PublicBranding } from "@/stores/auth-store";
import type { SessionUser } from "@/types/session";

const setupSchema = z
  .object({
    displayName: z.string().trim().min(2, "Nom affiché requis"),
    username: z.string().trim().min(3, "Identifiant requis"),
    password: z.string().min(8, "8 caractères minimum"),
    confirmPassword: z.string().min(8, "Confirmation requise"),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Les mots de passe ne correspondent pas.",
    path: ["confirmPassword"],
  });

type SetupFormValues = z.infer<typeof setupSchema>;

type SetupResponse = {
  ok: true;
  user: SessionUser;
  branding: PublicBranding;
};

const ADMIN_CREATION_TIMEOUT_MS = 25_000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} a dépassé ${Math.round(timeoutMs / 1000)} secondes.`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }
}

export function SetupPage() {
  const navigate = useNavigate();
  const hydrated = useAuthStore((state) => state.hydrated);
  const user = useAuthStore((state) => state.user);
  const bootstrapRequired = useAuthStore((state) => state.bootstrapRequired);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [bootstrapReady, setBootstrapReady] = useState(false);

  const form = useForm<SetupFormValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      displayName: "Administrateur SAMY SOFT",
      username: "admin",
      password: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    void refreshBootstrapStatus()
      .then((status) => {
        setBootstrapReady(true);
        useAuthStore.getState().setBootstrapRequired(status.state === "needs_setup");
      })
      .catch((e) => {
        setBootstrapReady(false);
        setFormError(e instanceof Error ? e.message : "Initialisation de la base indisponible.");
        useAuthStore.getState().setBootstrapRequired(false);
      })
      .finally(() => setChecking(false));
  }, []);

  async function createAdmin(values: SetupFormValues): Promise<void> {
    setFormError(null);
    setSuccessMessage(null);
    setSubmitStatus("Création de l’administrateur…");
    try {
      const res = await withTimeout(
        samyInvoke<SetupResponse>(IPC_CHANNELS.BOOTSTRAP_CREATE_ADMIN, {
          displayName: values.displayName,
          username: values.username,
          password: values.password,
        }),
        ADMIN_CREATION_TIMEOUT_MS,
        "Création administrateur",
      );
      setSubmitStatus("Administrateur créé. Initialisation de la session…");
      useAuthStore.getState().setUser(res.user);
      useAuthStore.getState().setBranding(res.branding);
      useAuthStore.getState().setBootstrapRequired(false);
      await refreshSettingsSilently();
      setSuccessMessage("Administrateur créé avec succès. Ouverture du tableau de bord…");
      navigate("/", { replace: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Échec de création de l’administrateur.";
      setFormError(message);
      setSubmitStatus(null);
    }
  }

  if (hydrated && user && !bootstrapRequired) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-full min-w-[1024px] items-center justify-center bg-sidebar-bg px-8 py-10 text-foreground">
      <section className="w-full max-w-xl border border-border bg-surface-elevated p-6 shadow-2xl">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-foreground-muted">
          Première installation
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Initialiser SAMY SOFT</h1>
        <p className="mt-3 text-[13px] leading-snug text-foreground-muted">
          Aucun utilisateur n’existe dans la base locale. Créez l’administrateur principal avant
          toute connexion au poste.
        </p>

        {checking ? (
          <div className="mt-6 border border-border bg-surface-muted px-3 py-2 text-[12px] text-foreground-muted">
            Diagnostic bootstrap en cours…
          </div>
        ) : null}

        {!checking && !bootstrapReady ? (
          <div className="mt-6 border border-danger/40 bg-danger/10 px-3 py-2 text-[12px] font-semibold text-danger">
            La base locale n’est pas prête. Relancez l’application ou contactez le support SAMY SOFT.
          </div>
        ) : null}

        <form
          className="mt-6 space-y-4"
          onSubmit={form.handleSubmit(createAdmin)}
          hidden={!bootstrapReady}
        >
          <FormField label="Nom affiché" error={form.formState.errors.displayName?.message}>
            <input className={cn("focus-ring control-chrome w-full")} {...form.register("displayName")} />
          </FormField>
          <FormField label="Identifiant administrateur" error={form.formState.errors.username?.message}>
            <input
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              className={cn("focus-ring control-chrome w-full font-mono")}
              {...form.register("username")}
            />
          </FormField>
          <FormField label="Mot de passe" error={form.formState.errors.password?.message}>
            <input
              autoComplete="new-password"
              type="password"
              className={cn("focus-ring control-chrome w-full font-mono")}
              {...form.register("password")}
            />
          </FormField>
          <FormField label="Confirmer le mot de passe" error={form.formState.errors.confirmPassword?.message}>
            <input
              autoComplete="new-password"
              type="password"
              className={cn("focus-ring control-chrome w-full font-mono")}
              {...form.register("confirmPassword")}
            />
          </FormField>

          {formError ? (
            <div className="border border-danger/40 bg-danger/10 px-3 py-2 text-[12px] font-semibold text-danger">
              {formError}
            </div>
          ) : null}

          {submitStatus ? (
            <div className="border border-accent/35 bg-accent/10 px-3 py-2 text-[12px] font-semibold text-accent">
              {submitStatus}
            </div>
          ) : null}

          {successMessage ? (
            <div className="border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[12px] font-semibold text-emerald-600">
              {successMessage}
            </div>
          ) : null}

          <button
            type="submit"
            className="focus-ring inline-flex min-h-touch w-full items-center justify-center border border-accent/85 bg-accent px-4 py-2 text-[13px] font-semibold text-accent-foreground hover:bg-accent/95 disabled:border-border disabled:bg-surface-muted disabled:text-foreground-muted"
            disabled={checking || !bootstrapReady || form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? "Création en cours…" : "Créer l’administrateur et continuer"}
          </button>
        </form>
      </section>
    </div>
  );
}
