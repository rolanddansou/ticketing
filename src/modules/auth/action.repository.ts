import type { CreateUserDto } from "../users/user.dto.js";
export interface ActionDelivery { hash: string; expiresAt: Date; payload: string }
export interface InvitationRepository {
  invite(actorId: string, input: CreateUserDto, delivery: ActionDelivery): Promise<void>;
  resend(actorId: string, id: string, createDelivery: (email: string) => ActionDelivery): Promise<void>;
  // Cheap pre-check so the service can skip the costly Argon2 hash for an obviously invalid token;
  // the transactional check inside acceptInvitation/resetPassword remains the authoritative one.
  isInvitationTokenValid(hash: string): Promise<boolean>;
  acceptInvitation(hash: string, passwordHash: string): Promise<void>;
}
export interface PasswordRecoveryRepository {
  requestReset(email: string, createDelivery: (email: string) => ActionDelivery): Promise<void>;
  isResetTokenValid(hash: string): Promise<boolean>;
  resetPassword(hash: string, passwordHash: string): Promise<void>;
}
