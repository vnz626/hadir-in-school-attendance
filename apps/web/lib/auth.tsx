"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, type ReactNode } from "react";
import { USER_ROLE, type AuthUser, type LoginResponse, type UserRole } from "@hadirin/shared";
import { api, ApiError } from "./api";
import { ForbiddenState } from "../components/ui/state-panels";
import { SkeletonRows } from "../components/ui/skeleton";
import { useEffect } from "react";

export const ME_KEY = ["me"] as const;

/** Beranda tiap peran. */
export function homeFor(role: UserRole): string {
  switch (role) {
    case USER_ROLE.ADMIN:
      return "/admin";
    case USER_ROLE.TEACHER:
      return "/guru";
    case USER_ROLE.STUDENT:
      return "/siswa";
    case USER_ROLE.PARENT:
      return "/ortu";
  }
}

async function fetchMe(): Promise<AuthUser | null> {
  try {
    return (await api<LoginResponse>("/auth/me")).user;
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401) throw e;
  }
  // Token akses habis: coba pulihkan lewat refresh token sebelum menyerah.
  try {
    return (await api<LoginResponse>("/auth/refresh", { method: "POST" })).user;
  } catch {
    return null;
  }
}

export function useAuth() {
  const client = useQueryClient();
  const router = useRouter();
  const query = useQuery({ queryKey: ME_KEY, queryFn: fetchMe, staleTime: 60_000, retry: false });

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      client.clear();
      router.replace("/masuk");
    }
  }, [client, router]);

  return {
    user: query.data ?? null,
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    logout,
  };
}

/**
 * Pelindung halaman: belum masuk -> /masuk; kata sandi awal belum diganti -> /ganti-kata-sandi;
 * peran tidak cocok -> keadaan "tanpa akses" (403), bukan pengalihan diam-diam.
 */
export function RequireAuth({
  roles,
  children,
}: {
  roles?: readonly UserRole[];
  children: ReactNode;
}) {
  const router = useRouter();
  const { user, loading, error, refetch } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user && !error) router.replace("/masuk");
    else if (user?.mustChangePassword) router.replace("/ganti-kata-sandi");
  }, [loading, user, error, router]);

  if (loading || (!user && !error) || user?.mustChangePassword)
    return <SkeletonRows rows={4} className="p-6" />;
  if (error)
    return (
      <div className="p-6">
        <ForbiddenState
          action={
            <button
              type="button"
              className="min-h-11 font-semibold text-primary"
              onClick={() => void refetch()}
            >
              Coba lagi
            </button>
          }
        />
      </div>
    );
  if (roles && user && !roles.includes(user.role)) return <ForbiddenState />;
  return <>{children}</>;
}
