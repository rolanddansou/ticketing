import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { createHealthController } from "../controllers/health.controller.js";

export const healthRouter = Router();

healthRouter.get("/health", createHealthController(() => prisma.$queryRaw`SELECT 1`));
