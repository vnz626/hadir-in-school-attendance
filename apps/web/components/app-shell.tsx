"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronsLeft, ChevronsRight, LogOut } from "lucide-react";
import type { AuthUser } from "@hadirin/shared";
import { cn } from "../lib/cn";
import { t, td } from "../lib/i18n";
import { NAV, type NavItem } from "../lib/nav";
import { Logo } from "./ui/logo";

const COLLAPSE_KEY = "hadirin.sidebarCollapsed";

function isActive(pathname: string, item: NavItem): boolean {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * Kerangka aplikasi per peran (Rancangan §4.4, §8): navigasi samping 232 px (diciutkan 72 px)
 * di desktop dan tablet, navigasi bawah di mobile. Hanya menu yang ada di Fase 2.
 */
export function AppShell({
  user,
  onLogout,
  children,
}: {
  user: AuthUser;
  onLogout: () => void;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const items = NAV[user.role];
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // penyimpanan diblokir: tampilkan menu penuh
    }
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        // diabaikan
      }
      return !c;
    });
  };

  return (
    <div className="min-h-dvh bg-paper md:flex">
      <a
        href="#isi"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-sm focus:bg-surface focus:px-3 focus:py-2"
      >
        {t("common.skipToContent")}
      </a>

      {/* Desktop dan tablet: navigasi samping. */}
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-surface md:flex md:w-[72px]",
          collapsed ? "lg:w-[72px]" : "lg:w-[232px]",
        )}
      >
        <div className="flex h-16 items-center px-4">
          <Logo />
        </div>
        <nav aria-label={t("nav.main")} className="flex flex-1 flex-col gap-1 px-2">
          {items.map((item) => {
            const active = isActive(pathname, item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={td(item.label)}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-sm px-3 text-sm",
                  active
                    ? "bg-primary-tint font-semibold text-primary"
                    : "text-ink-2 hover:bg-primary-tint",
                )}
              >
                <Icon aria-hidden className="size-5 shrink-0" strokeWidth={1.75} />
                <span className={cn("hidden", !collapsed && "lg:inline")}>{td(item.label)}</span>
                <span className={cn("sr-only", !collapsed && "lg:hidden")}>{td(item.label)}</span>
              </Link>
            );
          })}
        </nav>
        <div className="flex flex-col gap-1 border-t border-line p-2">
          <div className={cn("hidden px-3 py-2 text-caption", !collapsed && "lg:block")}>
            <p className="truncate font-semibold text-ink">{user.name}</p>
            <p className="text-ink-2">{td(`roles.${user.role}`)}</p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            title={t("auth.logout")}
            className="flex h-11 items-center gap-3 rounded-sm px-3 text-sm text-ink-2 hover:bg-primary-tint"
          >
            <LogOut aria-hidden className="size-5 shrink-0" strokeWidth={1.75} />
            <span className={cn("hidden", !collapsed && "lg:inline")}>{t("auth.logout")}</span>
            <span className={cn("sr-only", !collapsed && "lg:hidden")}>{t("auth.logout")}</span>
          </button>
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
            className="hidden h-11 items-center gap-3 rounded-sm px-3 text-sm text-ink-2 hover:bg-primary-tint lg:flex"
          >
            {collapsed ? (
              <ChevronsRight aria-hidden className="size-5" strokeWidth={1.75} />
            ) : (
              <ChevronsLeft aria-hidden className="size-5" strokeWidth={1.75} />
            )}
            {collapsed ? null : <span>{t("nav.collapse")}</span>}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile: bilah atas. */}
        <header className="flex h-14 items-center justify-between border-b border-line bg-surface px-4 md:hidden">
          <Logo />
          <div className="flex items-center gap-2">
            <span className="text-caption text-ink-2">{td(`roles.${user.role}`)}</span>
            <button
              type="button"
              onClick={onLogout}
              aria-label={t("auth.logout")}
              className="flex size-11 items-center justify-center rounded-sm text-ink-2"
            >
              <LogOut aria-hidden className="size-5" strokeWidth={1.75} />
            </button>
          </div>
        </header>

        <main
          id="isi"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-12 md:pt-8"
        >
          {children}
        </main>

        {/* Mobile: navigasi bawah, ikon 24 px, target sentuh penuh. */}
        <nav
          aria-label={t("nav.main")}
          className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          {items.map((item) => {
            const active = isActive(pathname, item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-caption",
                  active ? "font-semibold text-primary" : "text-ink-2",
                )}
              >
                <Icon aria-hidden className="size-6" strokeWidth={1.75} />
                {td(item.label)}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
