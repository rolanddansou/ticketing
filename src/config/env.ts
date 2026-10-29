import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.url().refine(
    (value) => ["postgresql:", "postgres:"].includes(new URL(value).protocol),
    "DATABASE_URL doit utiliser le protocole postgresql:// ou postgres://",
  ),
});

const result = schema.safeParse(process.env);
if (!result.success) {
  // Do not print input values: DATABASE_URL can contain credentials.
  throw new Error(`Configuration invalide : ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
}

export const env = result.data;
