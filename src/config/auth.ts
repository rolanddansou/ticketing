import "dotenv/config";
import { z } from "zod";
const config = z.object({
  JWT_SECRET: z.string().refine(value => Buffer.byteLength(value) >= 32),
  JWT_ISSUER: z.string().min(1).default("ticketing"),
  JWT_AUDIENCE: z.string().min(1).default("ticketing-api"),
});
const result = config.safeParse(process.env);
if (!result.success) throw new Error(`Configuration auth invalide : ${result.error.issues.map(issue => issue.path.join(".")).join(", ")}`);
export const authConfig = result.data;
