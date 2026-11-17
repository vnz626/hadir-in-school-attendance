import {
  BookOpen,
  Database,
  GraduationCap,
  House,
  LayoutDashboard,
  Settings,
  Upload,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { USER_ROLE, type UserRole } from "@hadirin/shared";
import type { MessageKey } from "./i18n";

export interface NavItem {
  href: string;
  label: MessageKey;
  icon: LucideIcon;
  /** Cocok hanya persis (beranda), bukan seluruh turunan. */
  exact?: boolean;
}

/** Menu per peran (Rancangan §5.1), dibatasi ke layar yang ada di Fase 2. */
export const NAV: Record<UserRole, NavItem[]> = {
  [USER_ROLE.ADMIN]: [
    { href: "/admin", label: "nav.overview", icon: LayoutDashboard, exact: true },
    { href: "/admin/master", label: "nav.master", icon: Database },
    { href: "/admin/impor", label: "nav.imports", icon: Upload },
    { href: "/admin/pengaturan", label: "nav.settings", icon: Settings },
  ],
  [USER_ROLE.TEACHER]: [
    { href: "/guru", label: "nav.home", icon: House, exact: true },
    { href: "/guru/kelas", label: "nav.classes", icon: GraduationCap },
  ],
  [USER_ROLE.STUDENT]: [
    { href: "/siswa", label: "nav.attendance", icon: BookOpen, exact: true },
    { href: "/siswa/akun", label: "nav.account", icon: UserRound },
  ],
  [USER_ROLE.PARENT]: [{ href: "/ortu", label: "nav.children", icon: Users, exact: true }],
};
