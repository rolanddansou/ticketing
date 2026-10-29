import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { unauthorized } from "./errors.js";

export interface JwtConfig { secret: string; issuer: string; audience: string }
export class JwtTokens {
  private readonly key: Uint8Array;
  constructor(private readonly config: JwtConfig) {
    if (Buffer.byteLength(config.secret) < 32) throw new Error("JWT_SECRET doit contenir au moins 32 octets");
    this.key = new TextEncoder().encode(config.secret);
  }
  sign(userId: string, sessionId: string): Promise<string> {
    return new SignJWT({ sid: sessionId }).setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(userId).setIssuer(this.config.issuer).setAudience(this.config.audience)
      .setIssuedAt().setExpirationTime("15m").sign(this.key);
  }
  async verify(token: string): Promise<{ userId: string; sessionId: string }> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ["HS256"], issuer: this.config.issuer, audience: this.config.audience,
        requiredClaims: ["sub", "sid", "iat", "exp"],
      });
      return { userId: z.uuid().parse(payload.sub), sessionId: z.uuid().parse(payload.sid) };
    } catch { throw unauthorized(); }
  }
}
