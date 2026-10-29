import { prisma } from "../../lib/prisma.js";
import { authConfig } from "../../config/auth.js";
import { PrismaAuthRepository } from "./prisma-auth.repository.js";
import { Argon2PasswordHasher } from "./password.js";
import { AuthService } from "./auth.service.js";
import { JwtTokens } from "./jwt.js";
export const authService = new AuthService(new PrismaAuthRepository(prisma), new Argon2PasswordHasher(), new JwtTokens({
  secret: authConfig.JWT_SECRET, issuer: authConfig.JWT_ISSUER, audience: authConfig.JWT_AUDIENCE,
}));
