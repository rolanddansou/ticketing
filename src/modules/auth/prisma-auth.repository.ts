import type { PrismaClient, User, Prisma } from "../../generated/prisma/client.js";
import type { UserDto } from "../users/user.dto.js";
import type { AuthRepository, Credentials, Identity } from "./auth.repository.js";
import type { BootstrapRepository } from "./bootstrap.js";

export function publicUser(user: User): UserDto {
  return { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status, createdAt: user.createdAt.toISOString() };
}
export async function lockUser(tx: Prisma.TransactionClient, id: string): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}::text, 0))::text`;
}

export class PrismaAuthRepository implements BootstrapRepository, AuthRepository {
  constructor(private readonly client: PrismaClient) {}
  async findCredentials(email: string): Promise<Credentials | null> {
    const user = await this.client.user.findUnique({ where: { email } });
    return user ? { user: publicUser(user), passwordHash: user.passwordHash } : null;
  }
  async createSession(userId: string, expectedHash: string, expiresAt: Date): Promise<string | null> {
    return this.client.$transaction(async tx => {
      await lockUser(tx, userId);
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user || user.status !== "ACTIVE" || user.passwordHash !== expectedHash) return null;
      return (await tx.authSession.create({ data: { userId, expiresAt } })).id;
    });
  }
  async identity(userId: string, sessionId: string): Promise<Identity | null> {
    const session = await this.client.authSession.findFirst({ where: {
      id: sessionId, userId, revokedAt: null, expiresAt: { gt: new Date() }, user: { status: "ACTIVE" },
    }, include: { user: true } });
    return session ? { user: publicUser(session.user), sessionId: session.id } : null;
  }
  async createFirstAdmin(input: { name: string; email: string; passwordHash: string }): Promise<void> {
    await this.client.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(4829301)::text`;
      if (await tx.user.count({ where: { role: "SUPER_ADMIN" } })) {
        throw new Error("Un Super Admin existe déjà");
      }
      await tx.user.create({ data: { ...input, role: "SUPER_ADMIN", status: "ACTIVE" } });
    });
  }
}
