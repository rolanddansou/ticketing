import type { PrismaClient } from "../../generated/prisma/client.js";
import type { BootstrapRepository } from "./bootstrap.js";

export class PrismaAuthRepository implements BootstrapRepository {
  constructor(private readonly client: PrismaClient) {}
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
