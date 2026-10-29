import { z } from "zod";
const common = { OUTBOX_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/) };
export const emailConfigSchema = z.discriminatedUnion("EMAIL_PROVIDER", [z.object({
  ...common, EMAIL_PROVIDER: z.literal("smtp"),
  SMTP_HOST: z.string().min(1), SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z.enum(["true", "false"]).default("false").transform(value => value === "true"),
  SMTP_USER: z.string().optional(), SMTP_PASSWORD: z.string().optional(), SMTP_FROM: z.email(),
}), z.object({
  ...common, EMAIL_PROVIDER: z.literal("resend"),
  RESEND_API_KEY: z.string().min(1).refine(value => !value.startsWith("replace_")),
  RESEND_FROM: z.email(),
})]);
export function parseEmailConfig(input: Record<string, unknown>) {
  const result = emailConfigSchema.safeParse({ ...input, EMAIL_PROVIDER: input.EMAIL_PROVIDER ?? "smtp" });
  if (!result.success) throw new Error(`Configuration email invalide : ${result.error.issues.map(issue => issue.path.join(".")).join(", ")}`);
  return result.data;
}
