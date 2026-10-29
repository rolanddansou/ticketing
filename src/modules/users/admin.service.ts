import { z } from "zod";
import { createUserSchema, updateUserSchema, userIdSchema } from "./user.dto.js";
import { passwordPairSchema } from "../auth/auth.dto.js";
import type { PasswordHasher } from "../auth/password.js";
import type { AdminRepository } from "./admin.repository.js";
export const adminCreateSchema = z.strictObject({ ...createUserSchema.shape, ...passwordPairSchema.shape })
  .refine(input => input.password === input.confirmPassword, { path: ["confirmPassword"], message: "Les mots de passe ne correspondent pas" });
export class AdminService {
  constructor(private readonly repository: AdminRepository, private readonly hasher: PasswordHasher) {}
  async create(actorId: string, input: unknown) {
    const { password, confirmPassword: _confirmation, ...user } = adminCreateSchema.parse(input);
    return this.repository.create(actorId, { ...user, passwordHash: await this.hasher.hash(password) });
  }
  update(actorId: string, id: unknown, input: unknown) {
    return this.repository.update(actorId, userIdSchema.parse(id), updateUserSchema.parse(input));
  }
  setEnabled(actorId: string, id: unknown, enabled: boolean) {
    return this.repository.setEnabled(actorId, userIdSchema.parse(id), enabled);
  }
}
