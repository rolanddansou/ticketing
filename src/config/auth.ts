import "dotenv/config";
import { z } from "zod";
const config = z.object({
  JWT_SECRET: z.string().refine(value => Buffer.byteLength(value) >= 32),
  JWT_ISSUER: z.string().min(1).default("ticketing"),
  JWT_AUDIENCE: z.string().min(1).default("ticketing-api"),
  FRONTEND_URL: z.url().refine(value => ["http:", "https:"].includes(new URL(value).protocol)).default("http://localhost:5173"),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
});
const result = config.safeParse(process.env);
if (!result.success) throw new Error(`Configuration auth invalide : ${result.error.issues.map(issue => issue.path.join(".")).join(", ")}`);
export const authConfig = result.data;
if (process.env.NODE_ENV === "production" && !authConfig.FRONTEND_URL.startsWith("https://")) throw new Error("FRONTEND_URL doit utiliser HTTPS en production");
export const browserConfig = { origin: new URL(authConfig.FRONTEND_URL).origin, secure: process.env.NODE_ENV === "production" };
