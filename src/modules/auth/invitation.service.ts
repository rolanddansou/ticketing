import { z } from "zod";
import { createUserSchema, userIdSchema } from "../users/user.dto.js";
import type { PasswordHasher } from "./password.js";
import { passwordPairSchema } from "./auth.dto.js";
import { tokenHash, newToken } from "./auth.service.js";
import type { InvitationRepository, ActionDelivery } from "./action.repository.js";
import { EmailEncryption } from "../email/encryption.js";

export const actionPasswordSchema = z.strictObject({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/), ...passwordPairSchema.shape })
  .refine(input => input.password === input.confirmPassword, { path: ["confirmPassword"], message: "Les mots de passe ne correspondent pas" });

export function actionDelivery(encryption: EmailEncryption, frontend: string, email: string, type: "invitation" | "reset"): ActionDelivery {
  const token = newToken();
  const link = new URL(type === "invitation" ? "/accept-invitation" : "/reset-password", frontend);
  link.hash = new URLSearchParams({ token }).toString();
  const subject = type === "invitation" ? "Invitation Ticketing" : "Réinitialisation du mot de passe";
  const href = link.toString().replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  return { hash: tokenHash(token), expiresAt: new Date(Date.now() + (type === "invitation" ? 48 * 3600000 : 30 * 60000)),
    payload: encryption.encrypt({ to: email, subject, text: `${subject} : ${link}`, html: `<p><a href="${href}">${subject}</a></p>` }),
  };
}
export class InvitationService {
  constructor(private readonly repository: InvitationRepository, private readonly hasher: PasswordHasher, private readonly encryption: EmailEncryption, private readonly frontend: string) {}
  async invite(actorId: string, input: unknown): Promise<void> {
    const user = createUserSchema.parse(input);
    await this.repository.invite(actorId, user, actionDelivery(this.encryption, this.frontend, user.email, "invitation"));
  }
  resend(actorId: string, id: unknown): Promise<void> {
    return this.repository.resend(actorId, userIdSchema.parse(id), email => actionDelivery(this.encryption, this.frontend, email, "invitation"));
  }
  async accept(input: unknown): Promise<void> {
    const { token, password } = actionPasswordSchema.parse(input);
    await this.repository.acceptInvitation(tokenHash(token), await this.hasher.hash(password));
  }
}
