import { Prisma, type PrismaClient, type User } from "../../generated/prisma/client.js";
import { createUserSchema, updateUserSchema, listUsersSchema, userIdSchema } from "./user.dto.js";
import type { CreateUserDto, UpdateUserDto, ListUsersDto, UserDto, UserListingDto } from "./user.dto.js";
import { UserNotFoundError, UserEmailAlreadyExistsError, type UserRepository } from "./user.repository.js";

function toDto(user: User): UserDto {
  return { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status, createdAt: user.createdAt.toISOString() };
}

function rethrow(error: unknown, id?: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") throw new UserEmailAlreadyExistsError();
    if (error.code === "P2025" && id) throw new UserNotFoundError(id);
  }
  throw error;
}

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly client: PrismaClient) {}
  async create(input: CreateUserDto): Promise<UserDto> {
    const data = createUserSchema.parse(input);
    try { return toDto(await this.client.user.create({ data })); }
    catch (error) { rethrow(error); }
  }
  async update(id: string, input: UpdateUserDto): Promise<UserDto> {
    const userId = userIdSchema.parse(id);
    const data = updateUserSchema.parse(input);
    try { return toDto(await this.client.user.update({ where: { id: userId }, data })); }
    catch (error) { rethrow(error, userId); }
  }
  async get(id: string): Promise<UserDto | null> {
    const userId = userIdSchema.parse(id);
    const user = await this.client.user.findUnique({ where: { id: userId } });
    return user ? toDto(user) : null;
  }
  async listing(input: ListUsersDto): Promise<UserListingDto> {
    const { page, limit, role, status } = listUsersSchema.parse(input);
    const where = { role, status };
    const [total, users] = await this.client.$transaction([
      this.client.user.count({ where }),
      this.client.user.findMany({ where, skip: (page - 1) * limit, take: limit,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { items: users.map(toDto), total, page, limit };
  }
}
