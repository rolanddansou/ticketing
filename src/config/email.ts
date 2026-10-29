import "dotenv/config";
import { z } from "zod";
const result = z.object({
  SMTP_HOST: z.string().min(1), SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z.enum(["true", "false"]).default("false").transform(value => value === "true"),
  SMTP_USER: z.string().optional(), SMTP_PASSWORD: z.string().optional(), SMTP_FROM: z.email(),
  OUTBOX_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/),
}).safeParse(process.env);
if (!result.success) throw new Error(`Configuration email invalide : ${result.error.issues.map(issue => issue.path.join(".")).join(", ")}`);
export const emailConfig = result.data;
