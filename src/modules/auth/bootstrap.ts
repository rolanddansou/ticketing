import { z } from "zod";
import { createUserSchema } from "../users/user.dto.js";
import { passwordPairSchema } from "./auth.dto.js";
import type { PasswordHasher } from "./password.js";

export const bootstrapSchema = z.strictObject({
  name: createUserSchema.shape.name, email: createUserSchema.shape.email,
  ...passwordPairSchema.shape,
}).refine(input => input.password === input.confirmPassword, { path: ["confirmPassword"], message: "Les mots de passe ne correspondent pas" });

export interface BootstrapRepository {
  createFirstAdmin(input: { name: string; email: string; passwordHash: string }): Promise<void>;
}
export class BootstrapService {
  constructor(private readonly repository: BootstrapRepository, private readonly hasher: PasswordHasher) {}
  async create(input: unknown): Promise<void> {
    const { name, email, password } = bootstrapSchema.parse(input);
    await this.repository.createFirstAdmin({ name, email, passwordHash: await this.hasher.hash(password) });
  }
}
