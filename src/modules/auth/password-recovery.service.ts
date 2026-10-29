import { z } from "zod";
import { createUserSchema } from "../users/user.dto.js";
import type { PasswordRecoveryRepository } from "./action.repository.js";
import type { PasswordHasher } from "./password.js";
import { EmailEncryption } from "../email/encryption.js";
import { actionDelivery, actionPasswordSchema } from "./invitation.service.js";
import { tokenHash } from "./auth.service.js";
export const forgotPasswordSchema = z.strictObject({ email: createUserSchema.shape.email });
export class PasswordRecoveryService {
  constructor(private readonly repository: PasswordRecoveryRepository, private readonly hasher: PasswordHasher, private readonly encryption: EmailEncryption, private readonly frontend: string) {}
  async forgot(input: unknown): Promise<void> {
    const { email } = forgotPasswordSchema.parse(input);
    await this.repository.requestReset(email, address => actionDelivery(this.encryption, this.frontend, address, "reset"));
  }
  async reset(input: unknown): Promise<void> {
    const { token, password } = actionPasswordSchema.parse(input);
    await this.repository.resetPassword(tokenHash(token), await this.hasher.hash(password));
  }
}
