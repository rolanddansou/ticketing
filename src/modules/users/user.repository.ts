import type { CreateUserDto, UpdateUserDto, ListUsersDto, UserDto, UserListingDto } from "./user.dto.js";

export interface UserScope { roles: UserDto["role"][] }
export interface UserRepository {
  create(input: CreateUserDto): Promise<UserDto>;
  update(id: string, input: UpdateUserDto): Promise<UserDto>;
  get(id: string, scope?: UserScope): Promise<UserDto | null>;
  listing(input: ListUsersDto, scope?: UserScope): Promise<UserListingDto>;
}
export class UserNotFoundError extends Error {
  constructor(public readonly userId: string) {
    super(`Utilisateur introuvable : ${userId}`);
    this.name = "UserNotFoundError";
  }
}
export class UserEmailAlreadyExistsError extends Error {
  constructor() {
    super("Cette adresse email est déjà utilisée");
    this.name = "UserEmailAlreadyExistsError";
  }
}
