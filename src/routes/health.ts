import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { createHealthController } from "../controllers/health.controller.js";
import { healthRateLimit } from "../middlewares/rate-limit.js";

export const healthRouter = Router();

healthRouter.get("/health", healthRateLimit(), createHealthController(() => prisma.$queryRaw`SELECT 1`));
