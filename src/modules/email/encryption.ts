import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { EmailMessage } from "./email-provider.js";
export class EmailEncryption {
  private readonly key: Buffer;
  constructor(hexKey: string) {
    if (!/^[a-fA-F0-9]{64}$/.test(hexKey)) throw new Error("OUTBOX_ENCRYPTION_KEY doit contenir 64 caractères hexadécimaux");
    this.key = Buffer.from(hexKey, "hex");
  }
  encrypt(message: EmailMessage): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(message), "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), ciphertext].map(part => part.toString("base64url")).join(".");
  }
  decrypt(payload: string): EmailMessage {
    const parts = payload.split(".");
    if (parts.length !== 3) throw new Error("Invalid encrypted email");
    const [iv, tag, ciphertext] = parts.map(part => Buffer.from(part, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")) as EmailMessage;
  }
}
