import { z } from "zod";
import { USER_ROLE } from "./constants";

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;

const newPassword = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Kata sandi minimal ${MIN_PASSWORD_LENGTH} karakter.`)
  .max(MAX_PASSWORD_LENGTH);

export const loginRequestSchema = z.object({
  // Email untuk guru dan admin, NIS untuk siswa.
  identifier: z.string().trim().min(1).max(190),
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  // Identitas perangkat acak 128 bit dari klien siswa (Rancangan §12.3).
  deviceId: z.string().min(16).max(128).optional(),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  newPassword,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export const forgotPasswordRequestSchema = z.object({ email: z.string().trim().email().max(190) });
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

export const resetPasswordRequestSchema = z.object({
  token: z.string().min(20).max(200),
  newPassword,
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

export const authUserSchema = z.object({
  id: z.string(),
  role: z.enum([USER_ROLE.ADMIN, USER_ROLE.TEACHER, USER_ROLE.STUDENT, USER_ROLE.PARENT]),
  name: z.string(),
  mustChangePassword: z.boolean(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const loginResponseSchema = z.object({ user: authUserSchema });
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const temporaryPasswordResponseSchema = z.object({ temporaryPassword: z.string() });
export type TemporaryPasswordResponse = z.infer<typeof temporaryPasswordResponseSchema>;
