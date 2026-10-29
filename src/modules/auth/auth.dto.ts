import { z } from "zod";
export const passwordSchema = z.string().min(15).max(128);
export const passwordPairSchema = z.strictObject({ password: passwordSchema, confirmPassword: z.string() })
  .refine(input => input.password === input.confirmPassword, { path: ["confirmPassword"], message: "Les mots de passe ne correspondent pas" });
