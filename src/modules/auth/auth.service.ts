import { randomBytes } from "node:crypto";
import type { AuthRepository, Identity } from "./auth.repository.js";
import type { PasswordHasher } from "./password.js";
import { JwtTokens } from "./jwt.js";
import { unauthorized } from "./errors.js";

export class AuthService {
  private readonly dummyHash: Promise<string>;
  constructor(private readonly repository: AuthRepository, private readonly hasher: PasswordHasher, private readonly tokens: JwtTokens) {
    this.dummyHash = hasher.hash(randomBytes(32).toString("hex"));
  }
  async login(email: string, password: string) {
    const credentials = await this.repository.findCredentials(email);
    const valid = await this.hasher.verify(credentials?.passwordHash ?? await this.dummyHash, password);
    if (!credentials?.passwordHash || !valid || credentials.user.status !== "ACTIVE") throw unauthorized();
    const sessionId = await this.repository.createSession(credentials.user.id, credentials.passwordHash, new Date(Date.now() + 30 * 86400_000));
    if (!sessionId) throw unauthorized();
    return { accessToken: await this.tokens.sign(credentials.user.id, sessionId), tokenType: "Bearer", expiresIn: 900, user: credentials.user };
  }
  async authenticate(token: string): Promise<Identity> {
    const { userId, sessionId } = await this.tokens.verify(token);
    const identity = await this.repository.identity(userId, sessionId);
    if (!identity) throw unauthorized();
    return identity;
  }
}
