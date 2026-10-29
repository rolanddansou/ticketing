import type { UserDto } from "../users/user.dto.js";
export interface Credentials { user: UserDto; passwordHash: string | null }
export interface Identity { user: UserDto; sessionId: string }
export interface AuthRepository {
  findCredentials(email: string): Promise<Credentials | null>;
  createSession(userId: string, expectedHash: string, expiresAt: Date): Promise<string | null>;
  identity(userId: string, sessionId: string): Promise<Identity | null>;
}
