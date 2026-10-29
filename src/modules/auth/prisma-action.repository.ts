import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import type { CreateUserDto } from "../users/user.dto.js";
import type { ActionDelivery, InvitationRepository, PasswordRecoveryRepository } from "./action.repository.js";
import { HttpError } from "./errors.js";
import { lockUser } from "./prisma-auth.repository.js";
import { adminLock, requireAdmin, requireManagedRole, revokeSecurity } from "../users/prisma-admin.repository.js";

export async function invalidateLinks(tx: Prisma.TransactionClient, userId: string, type?: "INVITATION" | "PASSWORD_RESET") {
  const where = { userId, type, consumedAt: null };
  await tx.emailOutbox.updateMany({ where: { actionToken: where, deliveredAt: null, abandonedAt: null }, data: { payload: null, abandonedAt: new Date() } });
  await tx.actionToken.updateMany({ where, data: { consumedAt: new Date() } });
}
export async function enqueueAction(tx: Prisma.TransactionClient, userId: string, type: "INVITATION" | "PASSWORD_RESET", delivery: ActionDelivery) {
  const token = await tx.actionToken.create({ data: { userId, type, hash: delivery.hash, expiresAt: delivery.expiresAt } });
  await tx.emailOutbox.create({ data: { actionTokenId: token.id, payload: delivery.payload, expiresAt: delivery.expiresAt } });
}
export class PrismaActionRepository implements InvitationRepository, PasswordRecoveryRepository {
  constructor(private readonly client: PrismaClient) {}
  async invite(actorId: string, input: CreateUserDto, delivery: ActionDelivery): Promise<void> {
    try {
      await this.client.$transaction(async tx => {
        await adminLock(tx); const actor = await requireAdmin(tx, actorId);
        requireManagedRole(actor.role, input.role ?? "USER");
        const user = await tx.user.create({ data: { ...input, status: "INVITED" } });
        await enqueueAction(tx, user.id, "INVITATION", delivery);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new HttpError(409, "Cette adresse email est déjà utilisée");
      throw error;
    }
  }
  async resend(actorId: string, id: string, createDelivery: (email: string) => ActionDelivery): Promise<void> {
    await this.client.$transaction(async tx => {
      await adminLock(tx); const actor = await requireAdmin(tx, actorId); await lockUser(tx, id);
      const user = await tx.user.findUnique({ where: { id } });
      if (!user) throw new HttpError(404, "Utilisateur introuvable");
      requireManagedRole(actor.role, user.role);
      if (user.status !== "INVITED") throw new HttpError(409, "Le compte n'est pas en attente d'invitation");
      await invalidateLinks(tx, id, "INVITATION");
      await enqueueAction(tx, id, "INVITATION", createDelivery(user.email));
    });
  }
  async requestReset(email: string, createDelivery: (email: string) => ActionDelivery): Promise<void> {
    const found = await this.client.user.findUnique({ where: { email } });
    if (!found) return;
    await this.client.$transaction(async tx => {
      await lockUser(tx, found.id);
      const user = await tx.user.findUnique({ where: { id: found.id } });
      if (!user || user.email !== email || user.status !== "ACTIVE") return;
      await invalidateLinks(tx, user.id, "PASSWORD_RESET");
      await enqueueAction(tx, user.id, "PASSWORD_RESET", createDelivery(user.email));
    });
  }
  acceptInvitation(hash: string, passwordHash: string): Promise<void> { return this.consume(hash, passwordHash, "INVITATION"); }
  resetPassword(hash: string, passwordHash: string): Promise<void> { return this.consume(hash, passwordHash, "PASSWORD_RESET"); }
  private async consume(hash: string, passwordHash: string, type: "INVITATION" | "PASSWORD_RESET"): Promise<void> {
    const found = await this.client.actionToken.findUnique({ where: { hash } });
    if (!found) throw new HttpError(400, "Lien invalide ou expiré");
    await this.client.$transaction(async tx => {
      await lockUser(tx, found.userId);
      const token = await tx.actionToken.findUnique({ where: { hash }, include: { user: true } });
      if (!token || token.type !== type || token.consumedAt || token.expiresAt <= new Date() || token.user.status !== (type === "INVITATION" ? "INVITED" : "ACTIVE")) throw new HttpError(400, "Lien invalide ou expiré");
      await tx.user.update({ where: { id: token.userId }, data: { passwordHash, status: "ACTIVE" } });
      await invalidateLinks(tx, token.userId);
      await revokeSecurity(tx, token.userId);
    });
  }
}
