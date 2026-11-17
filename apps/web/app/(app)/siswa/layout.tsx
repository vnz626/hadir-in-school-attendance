"use client";

import type { ReactNode } from "react";
import { USER_ROLE } from "@hadirin/shared";
import { RequireAuth } from "../../../lib/auth";

export default function StudentLayout({ children }: { children: ReactNode }) {
  return <RequireAuth roles={[USER_ROLE.STUDENT]}>{children}</RequireAuth>;
}
