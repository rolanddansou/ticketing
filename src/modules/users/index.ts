import { prisma } from "../../lib/prisma.js";
import { PrismaUserRepository } from "./prisma-user.repository.js";
import type { UserRepository } from "./user.repository.js";

export const userRepository: UserRepository = new PrismaUserRepository(prisma);
export type * from "./user.dto.js";
export * from "./user.repository.js";
