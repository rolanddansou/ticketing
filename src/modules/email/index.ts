import { prisma } from "../../lib/prisma.js";
import { emailConfig } from "../../config/email.js";
import { SmtpEmailProvider } from "./email-provider.js";
import { EmailEncryption } from "./encryption.js";
import { PrismaOutboxRepository } from "./prisma-outbox.repository.js";
import { OutboxWorker } from "./worker.js";
import { ResendEmailProvider } from "./resend-email-provider.js";
export const emailEncryption = new EmailEncryption(emailConfig.OUTBOX_ENCRYPTION_KEY);
const provider = emailConfig.EMAIL_PROVIDER === "resend"
  ? new ResendEmailProvider(emailConfig.RESEND_API_KEY, emailConfig.RESEND_FROM)
  : new SmtpEmailProvider({
  host: emailConfig.SMTP_HOST, port: emailConfig.SMTP_PORT, secure: emailConfig.SMTP_SECURE,
  user: emailConfig.SMTP_USER, password: emailConfig.SMTP_PASSWORD,
}, emailConfig.SMTP_FROM);
export const emailWorker = new OutboxWorker(new PrismaOutboxRepository(prisma), provider, emailEncryption);
