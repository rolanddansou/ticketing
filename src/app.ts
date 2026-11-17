import express from "express";
import { sendApiError } from "./middlewares/api-error.js";
import { globalRateLimit } from "./middlewares/rate-limit.js";
import { createDocsRouter } from "./routes/docs.js";
import { env } from "./config/env.js";

import { errorHandler } from "./middlewares/error-handler.js";
import { healthRouter } from "./routes/health.js";
import { createTicketsRouter } from "./routes/tickets.js";
import { ticketAgentRepository, waitForTicketResult } from "./modules/ticket-agent-ia/index.js";
import { ticketRepository } from "./modules/tickets/index.js";
import { authService } from "./modules/auth/index.js";
import { createAuthRouter } from "./routes/auth.js";
import { browserConfig, authConfig } from "./config/auth.js";
import { cors, securityHeaders } from "./middlewares/browser-security.js";
import { createUsersRouter } from "./routes/users.js";
import { AdminService } from "./modules/users/admin.service.js";
import { PrismaAdminRepository } from "./modules/users/prisma-admin.repository.js";
import { Argon2PasswordHasher } from "./modules/auth/password.js";
import { userRepository } from "./modules/users/index.js";
import { prisma } from "./lib/prisma.js";
import { InvitationService } from "./modules/auth/invitation.service.js";
import { PrismaActionRepository } from "./modules/auth/prisma-action.repository.js";
import { emailEncryption } from "./modules/email/index.js";
import { PasswordRecoveryService } from "./modules/auth/password-recovery.service.js";
import { authenticate } from "./middlewares/authenticate.js";

export const app = express();

app.disable("x-powered-by");
app.set("trust proxy", authConfig.TRUST_PROXY_HOPS || false);
app.use(securityHeaders(env.NODE_ENV === "production"));
app.use(cors(browserConfig));
app.use(globalRateLimit());
app.use(express.json({ limit: "1mb" }));
app.use(healthRouter);
app.use(createDocsRouter(env.NODE_ENV === "production"));
const invitations = new InvitationService(new PrismaActionRepository(prisma), new Argon2PasswordHasher(), emailEncryption, authConfig.FRONTEND_URL);
const recovery = new PasswordRecoveryService(new PrismaActionRepository(prisma), new Argon2PasswordHasher(), emailEncryption, authConfig.FRONTEND_URL);
app.use("/auth", createAuthRouter(authService, browserConfig, invitations, recovery));
app.use("/users", createUsersRouter(authService, new AdminService(new PrismaAdminRepository(prisma), new Argon2PasswordHasher()), userRepository, invitations));
app.use("/tickets", createTicketsRouter(ticketRepository, authenticate(authService), ticketAgentRepository, waitForTicketResult));
app.use((_req, res) => {
  sendApiError(res, 404, "Route introuvable");
});
app.use(errorHandler);
