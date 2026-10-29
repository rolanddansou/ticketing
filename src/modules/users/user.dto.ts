import { z } from "zod";

export const userIdSchema = z.uuid();
export const userRoleSchema = z.enum(["SUPER_ADMIN", "EMPLOYEE", "AGENT", "VIEWER"]);
export const userStatusSchema = z.enum(["INVITED", "ACTIVE", "DISABLED"]);
const name = z.string().trim().min(1).max(200);
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const createUserSchema = z.strictObject({ name, email, role: userRoleSchema.default("EMPLOYEE") });
export const updateUserSchema = z.strictObject({
  name: name.optional(), email: email.optional(), role: userRoleSchema.optional(),
}).refine(input => Object.values(input).some(value => value !== undefined), {
  message: "Au moins un champ doit être fourni",
});

const positiveInteger = z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)])
  .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));
export const listUsersSchema = z.strictObject({
  status: userStatusSchema.optional(),
  page: positiveInteger.default(1),
  limit: positiveInteger.pipe(z.number().max(100)).default(20),
  role: userRoleSchema.optional(),
}).refine(({ page, limit }) => Number.isSafeInteger((page - 1) * limit), {
  message: "Pagination trop grande", path: ["page"],
});

export type CreateUserDto = z.input<typeof createUserSchema>;
export type UpdateUserDto = z.input<typeof updateUserSchema>;
export type ListUsersDto = z.input<typeof listUsersSchema>;
export interface UserDto {
  status: z.infer<typeof userStatusSchema>;
  id: string;
  name: string;
  email: string;
  role: z.infer<typeof userRoleSchema>;
  createdAt: string;
}
export interface UserListingDto {
  items: UserDto[];
  total: number;
  page: number;
  limit: number;
}
