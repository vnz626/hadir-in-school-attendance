export const CHECKIN_ERROR_CODE = {
  QR_EXPIRED: "QR_EXPIRED",
  QR_INVALID: "QR_INVALID",
  SESSION_CLOSED: "SESSION_CLOSED",
  NO_ACTIVE_SESSION: "NO_ACTIVE_SESSION",
  ALREADY_CHECKED_IN: "ALREADY_CHECKED_IN",
  OUT_OF_GEOFENCE: "OUT_OF_GEOFENCE",
  LOCATION_ACCURACY_LOW: "LOCATION_ACCURACY_LOW",
  LOCATION_REQUIRED: "LOCATION_REQUIRED",
  DEVICE_MISMATCH: "DEVICE_MISMATCH",
  NOT_ENROLLED: "NOT_ENROLLED",
  RATE_LIMITED: "RATE_LIMITED",
} as const;

export const COMMON_ERROR_CODE = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  HOLIDAY: "HOLIDAY",
  SESSION_ALREADY_OPEN: "SESSION_ALREADY_OPEN",
  BACKFILL_WINDOW_PASSED: "BACKFILL_WINDOW_PASSED",
  // Galat server tak terduga (HTTP 5xx). Tidak ada di daftar awal AGENTS.md §6; ditambahkan agar 500 tidak menyamar sebagai CONFLICT.
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export const ERROR_CODE = { ...CHECKIN_ERROR_CODE, ...COMMON_ERROR_CODE } as const;
export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];

/** Format galat seragam seluruh API. Pesan berbahasa Indonesia. */
export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; details?: Record<string, unknown> };
}
