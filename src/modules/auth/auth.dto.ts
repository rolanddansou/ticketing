import { z } from "zod";
import { createUserSchema } from "../users/user.dto.js";
export const loginSchema = z.strictObject({ email: createUserSchema.shape.email, password: z.string().min(1).max(128) });
export const passwordSchema = z.string().min(15).max(128);
export const passwordPairSchema = z.strictObject({ password: passwordSchema, confirmPassword: z.string() })
  .refine(input => input.password === input.confirmPassword, { path: ["confirmPassword"], message: "Les mots de passe ne correspondent pas" });
export const changePasswordSchema = z.strictObject({ currentPassword: z.string().min(1).max(128), ...passwordPairSchema.shape })
  .refine(input => input.password === input.confirmPassword, { path: ["confirmPassword"], message: "Les mots de passe ne correspondent pas" });
