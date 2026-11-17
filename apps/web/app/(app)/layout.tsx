"use client";

import type { ReactNode } from "react";
import { useAuth, RequireAuth } from "../../lib/auth";
import { AppShell } from "../../components/app-shell";

function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <AppShell user={user} onLogout={() => void logout()}>
      {children}
    </AppShell>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <Shell>{children}</Shell>
    </RequireAuth>
  );
}
