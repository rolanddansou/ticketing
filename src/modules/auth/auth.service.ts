import { randomBytes, createHash } from "node:crypto";
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
import type { AuthRepository, Identity } from "./auth.repository.js";
import type { PasswordHasher } from "./password.js";
import { JwtTokens } from "./jwt.js";
import { unauthorized, HttpError } from "./errors.js";
import { changePasswordSchema } from "./auth.dto.js";

export class AuthService {
  private readonly dummyHash: Promise<string>;
  constructor(private readonly repository: AuthRepository, private readonly hasher: PasswordHasher, private readonly tokens: JwtTokens) {
    this.dummyHash = hasher.hash(randomBytes(32).toString("hex"));
  }
  async login(email: string, password: string) {
    const credentials = await this.repository.findCredentials(email);
    const valid = await this.hasher.verify(credentials?.passwordHash ?? await this.dummyHash, password);
    if (!credentials?.passwordHash || !valid || credentials.user.status !== "ACTIVE") throw unauthorized();
    const refreshToken = newToken();
    const refreshExpiresAt = new Date(Date.now() + 30 * 86400_000);
    const sessionId = await this.repository.createSession(credentials.user.id, credentials.passwordHash, refreshExpiresAt, tokenHash(refreshToken));
    if (!sessionId) throw unauthorized();
    return { accessToken: await this.tokens.sign(credentials.user.id, sessionId), tokenType: "Bearer", expiresIn: 900, user: credentials.user, refreshToken, refreshExpiresAt };
  }
  async refresh(token: string) {
    const refreshToken = newToken();
    const result = await this.repository.rotateRefresh(tokenHash(token), tokenHash(refreshToken));
    if (!result) throw unauthorized();
    return { accessToken: await this.tokens.sign(result.identity.user.id, result.identity.sessionId), tokenType: "Bearer", expiresIn: 900,
      user: result.identity.user, refreshToken, refreshExpiresAt: result.expiresAt };
  }
  logout(token?: string) { return token ? this.repository.logout(tokenHash(token)) : Promise.resolve(); }
  logoutAll(userId: string) { return this.repository.logoutAll(userId); }
  async changePassword(identity: Identity, input: unknown): Promise<void> {
    const { currentPassword, password } = changePasswordSchema.parse(input);
    const credentials = await this.repository.findCredentials(identity.user.email);
    const valid = await this.hasher.verify(credentials?.passwordHash ?? await this.dummyHash, currentPassword);
    if (!valid || !credentials?.passwordHash || credentials.user.id !== identity.user.id) throw new HttpError(400, "Mot de passe actuel invalide");
    const changed = await this.repository.changePassword(identity.user.id, identity.sessionId, credentials.passwordHash, await this.hasher.hash(password));
    if (!changed) throw unauthorized();
  }
  async authenticate(token: string): Promise<Identity> {
    const { userId, sessionId } = await this.tokens.verify(token);
    const identity = await this.repository.identity(userId, sessionId);
    if (!identity) throw unauthorized();
    return identity;
  }
}
