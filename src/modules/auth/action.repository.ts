import type { CreateUserDto } from "../users/user.dto.js";
export interface ActionDelivery { hash: string; expiresAt: Date; payload: string }
export interface InvitationRepository {
  invite(actorId: string, input: CreateUserDto, delivery: ActionDelivery): Promise<void>;
  resend(actorId: string, id: string, createDelivery: (email: string) => ActionDelivery): Promise<void>;
  acceptInvitation(hash: string, passwordHash: string): Promise<void>;
}
