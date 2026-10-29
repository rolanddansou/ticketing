import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { HttpError } from "../auth/errors.js";
import { lockUser, publicUser } from "../auth/prisma-auth.repository.js";
import type { AdminRepository } from "./admin.repository.js";
import type { CreateUserDto, UpdateUserDto, UserDto } from "./user.dto.js";
import { invalidateLinks } from "../auth/prisma-action.repository.js";

export async function requireAdmin(tx: Prisma.TransactionClient, actorId: string) {
  const actor = await tx.user.findUnique({ where: { id: actorId } });
  if (!actor || actor.status !== "ACTIVE" || !["SUPER_ADMIN", "ADMIN"].includes(actor.role)) throw new HttpError(403, "Accès interdit");
  return actor;
}
export function requireManagedRole(actorRole: string, targetRole: string) {
  if (actorRole === "ADMIN" && !["AGENT", "USER"].includes(targetRole)) throw new HttpError(403, "Ce rôle ne peut pas être géré par un Admin");
}
export async function revokeSecurity(tx: Prisma.TransactionClient, userId: string) {
  await tx.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}
export async function adminLock(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(4829301)::text`;
}
function mapError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new HttpError(409, "Cette adresse email est déjà utilisée");
  throw error;
}
export class PrismaAdminRepository implements AdminRepository {
  constructor(private readonly client: PrismaClient) {}
  async create(actorId: string, input: CreateUserDto & { passwordHash: string }): Promise<UserDto> {
    try {
      return await this.client.$transaction(async tx => {
        await adminLock(tx); const actor = await requireAdmin(tx, actorId);
        requireManagedRole(actor.role, input.role ?? "USER");
        return publicUser(await tx.user.create({ data: { ...input, status: "ACTIVE" } }));
      });
    } catch (error) { mapError(error); }
  }
  update(actorId: string, id: string, input: UpdateUserDto) { return this.mutate(actorId, id, input); }
  setEnabled(actorId: string, id: string, enabled: boolean) { return this.mutate(actorId, id, {}, enabled); }
  private async mutate(actorId: string, id: string, input: UpdateUserDto, enabled?: boolean): Promise<UserDto> {
    try {
      return await this.client.$transaction(async tx => {
        await adminLock(tx); const actor = await requireAdmin(tx, actorId); await lockUser(tx, id);
        const current = await tx.user.findUnique({ where: { id } });
        if (!current) throw new HttpError(404, "Utilisateur introuvable");
        requireManagedRole(actor.role, current.role);
        if (input.role) requireManagedRole(actor.role, input.role);
        if (enabled === true && !current.passwordHash) throw new HttpError(409, "Ce compte doit accepter une invitation");
        const status = enabled === undefined ? current.status : enabled ? "ACTIVE" : "DISABLED";
        if (current.role === "SUPER_ADMIN" && current.status === "ACTIVE" && (status !== "ACTIVE" || (input.role && input.role !== "SUPER_ADMIN"))) {
          if (await tx.user.count({ where: { role: "SUPER_ADMIN", status: "ACTIVE" } }) <= 1) throw new HttpError(409, "Le dernier Super Admin actif doit être conservé");
        }
        if (input.email && input.email !== current.email || input.role && input.role !== current.role || enabled === false) await revokeSecurity(tx, id);
        if (input.email && input.email !== current.email || enabled === false) await invalidateLinks(tx, id);
        return publicUser(await tx.user.update({ where: { id }, data: { ...input, status } }));
      });
    } catch (error) { mapError(error); }
  }
}
