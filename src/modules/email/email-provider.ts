import nodemailer from "nodemailer";
export interface EmailMessage { to: string; subject: string; text: string; html: string }
export interface EmailProvider { send(message: EmailMessage, options?: { idempotencyKey: string }): Promise<void> }
export class SmtpEmailProvider implements EmailProvider {
  private readonly transport;
  constructor(config: { host: string; port: number; secure: boolean; user?: string; password?: string }, private readonly from: string) {
    this.transport = nodemailer.createTransport({
      host: config.host, port: config.port, secure: config.secure,
      requireTLS: process.env.NODE_ENV === "production" && !config.secure,
      auth: config.user ? { user: config.user, pass: config.password } : undefined,
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
    });
  }
  async send(message: EmailMessage): Promise<void> { await this.transport.sendMail({ ...message, from: this.from }); }
}
export class FakeEmailProvider implements EmailProvider {
  readonly messages: EmailMessage[] = [];
  fail = false;
  async send(message: EmailMessage): Promise<void> {
    if (this.fail) throw new Error("Simulated email delivery failure");
    this.messages.push(message);
  }
}
