"use client";

import type { ReactNode } from "react";
import { USER_ROLE } from "@hadirin/shared";
import { RequireAuth } from "../../../lib/auth";

export default function ParentLayout({ children }: { children: ReactNode }) {
  return <RequireAuth roles={[USER_ROLE.PARENT]}>{children}</RequireAuth>;
}
