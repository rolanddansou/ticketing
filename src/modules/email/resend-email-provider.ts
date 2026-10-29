import type { EmailMessage, EmailProvider } from "./email-provider.js";
import { ResendDeliveryError } from "./email-delivery-error.js";

export class ResendEmailProvider implements EmailProvider {
  constructor(private readonly apiKey: string, private readonly from: string, private readonly request: typeof fetch = fetch) {}
  async send(message: EmailMessage, options?: { idempotencyKey: string }): Promise<void> {
    const response = await this.request("https://api.resend.com/emails", {
      method: "POST", signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json",
        ...(options ? { "Idempotency-Key": options.idempotencyKey } : {}) },
      body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
    });
    if (!response.ok) throw new ResendDeliveryError(response.status);
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !("id" in result) || typeof result.id !== "string") throw new Error("Invalid Resend delivery response");
  }
}
