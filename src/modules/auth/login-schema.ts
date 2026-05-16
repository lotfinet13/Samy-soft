import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().min(1, "Identifiant requis"),
  password: z.string().min(1, "Mot de passe requis"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
