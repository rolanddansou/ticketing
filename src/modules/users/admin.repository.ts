import type { CreateUserDto, UpdateUserDto, UserDto } from "./user.dto.js";
export interface AdminRepository {
  create(actorId: string, input: CreateUserDto & { passwordHash: string }): Promise<UserDto>;
  update(actorId: string, id: string, input: UpdateUserDto): Promise<UserDto>;
  setEnabled(actorId: string, id: string, enabled: boolean): Promise<UserDto>;
}
